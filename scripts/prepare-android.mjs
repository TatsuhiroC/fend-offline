#!/usr/bin/env node
// Prepare the freshly generated Capacitor Android project for CI:
//
//  1. install a *stable* release keystore (from GitHub Secrets) so consecutive APKs
//     can be installed over each other. Without this, `assembleDebug` mints a brand
//     new debug key on every runner, and Android refuses the upgrade with
//     "App not installed" / signature mismatch.
//  2. stamp versionCode / versionName so each release is actually newer than the last.
//
// The changes are appended to the generated android/app/build.gradle, which is
// gitignored and recreated by `npx cap add android` on every run — nothing here is
// meant to be committed.
//
// Usage: node scripts/prepare-android.mjs [androidDir=android]
// Env:   ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD
//        GITHUB_REF_TYPE, GITHUB_REF_NAME, GITHUB_RUN_NUMBER, GITHUB_SHA (set by Actions)

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MARKER = '// --- injected by scripts/prepare-android.mjs ---';
const GRADLE = 'app/build.gradle';
const KEYSTORE = 'app/ci-release.keystore';
const PROPS = 'keystore.properties';

const androidDir = process.argv[2] ?? 'android';
const gradlePath = join(androidDir, GRADLE);

function fail(message) {
	console.error(`[android] ${message}`);
	process.exit(1);
}
function annotate(level, message) {
	console.log(`::${level}::${message}`);
}

if (!existsSync(gradlePath)) {
	fail(`${gradlePath} not found — run \`npx cap add android\` first`);
}

const keystoreB64 = (process.env.ANDROID_KEYSTORE_BASE64 ?? '').trim();
const storePassword = process.env.ANDROID_KEYSTORE_PASSWORD ?? '';
const keyAlias = process.env.ANDROID_KEY_ALIAS ?? '';
const keyPassword = process.env.ANDROID_KEY_PASSWORD ?? '';
const signingReady = Boolean(keystoreB64 && storePassword && keyAlias && keyPassword);
const keystore = signingReady ? Buffer.from(keystoreB64, 'base64') : undefined;
if (keystore && (keystore.length < 100 || !/^[A-Za-z0-9+/]+={0,2}$/.test(keystoreB64))) fail('ANDROID_KEYSTORE_BASE64 does not decode to a keystore file');

// ---------------------------------------------------------------- version stamping
function parseVersion(raw) {
	const clean = (raw ?? '').trim().replace(/^v/i, '');
	const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.exec(clean);
	return match ? { major: +match[1], minor: +match[2], patch: +match[3], clean } : null;
}

const refType = process.env.GITHUB_REF_TYPE ?? '';
const refName = (process.env.GITHUB_REF_NAME ?? '').trim();
const runText = process.env.GITHUB_RUN_NUMBER ?? '';
const runNumber = /^[1-9]\d*$/.test(runText) ? Number(runText) : NaN;
const sha = /^[a-f0-9]{7,40}$/i.test(process.env.GITHUB_SHA ?? '') ? process.env.GITHUB_SHA.slice(0, 7) : '';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

let versionName;
let versionCode;

if (refType === 'tag') {
	const v = parseVersion(refName);
	if (!v) fail('Release tag must be a complete semantic version such as v1.0.2');
	if (!signingReady) fail('Tagged releases require all four stable signing secrets');
	versionName = v.clean;
} else if (parseVersion(pkg.version) && Number.isFinite(runNumber)) {
	// Branch builds keep a descriptive name; both branches and tags share the
	// same versionCode counter so a branch APK can upgrade an installed release.
	const v = parseVersion(pkg.version);
	versionName = `${v.clean}-dev.${runNumber}${sha ? `+${sha}` : ''}`;
} else {
	versionName = undefined;
	versionCode = undefined;
}
if ((refType === 'tag' || process.env.GITHUB_ACTIONS === 'true') && (!Number.isSafeInteger(runNumber) || runNumber <= 0 || !versionName)) {
	fail('CI build requires valid version metadata and a positive run number');
}
if (versionName !== undefined && Number.isSafeInteger(runNumber) && runNumber > 0) {
	// Above previously shipped 1.x semver codes (v1.0.1 used 10001), with one
	// monotonic Actions counter for every build of this workflow.
	versionCode = 100000 + runNumber;
	if (versionCode > 2100000000) fail('versionCode exceeds the Android limit');
}

// ---------------------------------------------------------------- injected gradle
const lines = [
	'',
	MARKER,
	'def ciKeystorePropsFile = rootProject.file(\'keystore.properties\')',
	'def ciKeystoreProps = new Properties()',
	'if (ciKeystorePropsFile.exists()) {',
	'    ciKeystorePropsFile.withInputStream { ciKeystoreProps.load(it) }',
	'}',
	'',
	'android {',
];

if (versionCode !== undefined && versionName !== undefined) {
	lines.push(
		'    defaultConfig {',
		`        versionCode ${versionCode}`,
		`        versionName "${versionName}"`,
		'    }'
	);
}
if (signingReady) {
	lines.push(
		'    signingConfigs {',
		'        release {',
		`            storeFile rootProject.file('${KEYSTORE}')`,
		"            storePassword ciKeystoreProps['storePassword']",
		"            keyAlias ciKeystoreProps['keyAlias']",
		"            keyPassword ciKeystoreProps['keyPassword']",
		'        }',
		'    }',
		'    buildTypes {',
		'        release {',
		'            signingConfig signingConfigs.release',
		'        }',
		'    }'
	);
}
lines.push('}', MARKER, '');

const gradle = readFileSync(gradlePath, 'utf8');
const pieces = gradle.split(MARKER);
if (pieces.length !== 1 && pieces.length !== 3) fail('Malformed previous signing/version block');
const baseGradle = pieces.length === 3 ? pieces[0] + pieces[2] : gradle;
writeFileSync(gradlePath, baseGradle.replace(/\s*$/, '\n') + lines.join('\n'));

// ---------------------------------------------------------------- keystore + props
let mode = 'debug';

if (signingReady) {
	mkdirSync(join(androidDir, 'app'), { recursive: true });
	writeFileSync(join(androidDir, KEYSTORE), keystore, { mode: 0o600 });

	// java.util.Properties syntax: backslashes, separators and #/! must be escaped,
	// and so must leading/trailing spaces (which would otherwise be trimmed away).
	const escape = value =>
		String(value)
			.replace(/\\/g, '\\\\')
			.replace(/\r?\n/g, '\\n')
			.replace(/\t/g, '\\t')
			.replace(/([=:#!])/g, '\\$1')
			.replace(/^ /, '\\ ')
			.replace(/ $/, '\\ ')
			.replace(/[^\x20-\x7e]/g, char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));
	writeFileSync(
		join(androidDir, PROPS),
		[
			`storeFile=${KEYSTORE}`,
			`storePassword=${escape(storePassword)}`,
			`keyAlias=${escape(keyAlias)}`,
			`keyPassword=${escape(keyPassword)}`,
			'',
		].join('\n'),
		{ mode: 0o600 }
	);
	mode = 'release';
	console.log(`[android] release signing configured (keystore ${keystore.length} bytes)`);
} else {
	annotate(
		'warning',
		'No release keystore secrets found — falling back to a debug APK. Each run generates a NEW debug key, so users must uninstall before installing the next build. Set ANDROID_KEYSTORE_BASE64 / ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_ALIAS / ANDROID_KEY_PASSWORD (see README) to fix this.'
	);
}

if (versionCode !== undefined) {
	console.log(`[android] versionName=${versionName} versionCode=${versionCode}`);
} else {
	annotate('warning', 'Could not derive versionCode/versionName — the Capacitor template defaults will be used');
}

const apkPath = `${androidDir}/app/build/outputs/apk/${mode}/app-${mode}.apk`;
console.log(`[android] build target: assemble${mode === 'release' ? 'Release' : 'Debug'} -> ${apkPath}`);

if (process.env.GITHUB_OUTPUT) {
	appendFileSync(
		process.env.GITHUB_OUTPUT,
		`mode=${mode}\napk_path=${apkPath}\nversion_name=${versionName ?? ''}\n`
	);
}
if (process.env.GITHUB_STEP_SUMMARY) {
	appendFileSync(
		process.env.GITHUB_STEP_SUMMARY,
		[
			'### Android build',
			'',
			`- signing: **${mode === 'release' ? 'release keystore' : 'debug (unstable signature!)'}**`,
			versionCode !== undefined ? `- versionName: \`${versionName}\`, versionCode: \`${versionCode}\`` : '',
			`- apk: \`${apkPath}\``,
			'',
		]
			.filter(Boolean)
			.join('\n')
	);
}
