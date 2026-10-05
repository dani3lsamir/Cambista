// Adjusts the generated android/ project (run after `npx cap add android`).
// Idempotent: running it twice changes nothing the second time.
//
//  1. background-runner needs its .aar folder in flatDir (plugin README, Android section)
//  2. remove the location permissions background-runner declares: Cambista never uses location,
//     and Google Play rejects apps that ask for background location without a reason
//  3. versionCode / versionName from env VERSION_CODE and package.json
//  4. release signing from env (GitHub secrets), only when CAMBISTA_KEYSTORE is set
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gradlePath = resolve(root, 'android/app/build.gradle');
const manifestPath = resolve(root, 'android/app/src/main/AndroidManifest.xml');
if (!existsSync(gradlePath)) throw new Error('android/ not found: run `npx cap add android` first');

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const versionCode = Number(process.env.VERSION_CODE || 1);

// ---- build.gradle
let gradle = readFileSync(gradlePath, 'utf8');
const runnerLibs = "'../../node_modules/@capacitor/background-runner/android/src/main/libs'";
if (!gradle.includes(runnerLibs)) {
  gradle = gradle.replace(
    /(flatDir\s*\{\s*\n\s*dirs [^\n]+\n)/,
    `$1        dirs ${runnerLibs}, 'libs'\n`,
  );
  if (!gradle.includes(runnerLibs)) throw new Error('could not patch flatDir in build.gradle');
}
gradle = gradle.replace(/versionCode \d+/, `versionCode ${versionCode}`);
gradle = gradle.replace(/versionName "[^"]*"/, `versionName "${pkg.version}"`);

if (!gradle.includes('signingConfigs')) {
  gradle = gradle.replace(
    /(\n\s*buildTypes\s*\{)/,
    `
    signingConfigs {
        release {
            if (System.getenv('CAMBISTA_KEYSTORE')) {
                storeFile file(System.getenv('CAMBISTA_KEYSTORE'))
                storePassword System.getenv('CAMBISTA_KEYSTORE_PASSWORD')
                keyAlias System.getenv('CAMBISTA_KEY_ALIAS')
                keyPassword System.getenv('CAMBISTA_KEY_PASSWORD')
            }
        }
    }$1`,
  );
  gradle = gradle.replace(
    /(buildTypes\s*\{\s*\n\s*release\s*\{)/,
    `$1\n            if (System.getenv('CAMBISTA_KEYSTORE')) { signingConfig signingConfigs.release }`,
  );
  if (!gradle.includes('signingConfig signingConfigs.release')) throw new Error('could not add release signing');
}
writeFileSync(gradlePath, gradle);

// ---- AndroidManifest.xml
let manifest = readFileSync(manifestPath, 'utf8');
if (!manifest.includes('xmlns:tools')) {
  manifest = manifest.replace(
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android"',
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android"\n    xmlns:tools="http://schemas.android.com/tools"',
  );
}
const removed = ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'ACCESS_BACKGROUND_LOCATION'];
for (const p of removed) {
  const line = `<uses-permission android:name="android.permission.${p}" tools:node="remove" />`;
  if (!manifest.includes(line)) manifest = manifest.replace('</manifest>', `    ${line}\n</manifest>`);
}
writeFileSync(manifestPath, manifest);

console.log(`android prepared: versionCode ${versionCode}, versionName ${pkg.version}, signing ${process.env.CAMBISTA_KEYSTORE ? 'release' : 'debug only'}`);
