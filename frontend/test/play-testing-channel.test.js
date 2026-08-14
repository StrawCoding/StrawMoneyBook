import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const configPath = resolve(import.meta.dirname, '../android/play-testing-channel.json')
const fastlaneFastfile = readFileSync(
  resolve(import.meta.dirname, '../android/fastlane/Fastfile'),
  'utf8',
)

function loadConfig() {
  return JSON.parse(readFileSync(configPath, 'utf8'))
}

test('play-testing-channel.json defaults to internal for phone + wear', () => {
  const config = loadConfig()
  assert.equal(config.channel, 'internal')
  assert.equal(config.tracks.internal.phone, 'internal')
  assert.equal(config.tracks.internal.wear, 'wear:internal')
  assert.equal(config.tracks.closed.phone, 'alpha')
  assert.equal(config.tracks.closed.wear, 'wear:WearOS')
})

test('fastlane resolves testing tracks from play-testing-channel.json', () => {
  assert.match(fastlaneFastfile, /PLAY_TESTING_CHANNEL_CONFIG_PATH/)
  assert.match(fastlaneFastfile, /def resolve_play_testing_tracks!/)
  assert.match(fastlaneFastfile, /play-testing-channel\.json/)
  assert.match(fastlaneFastfile, /DEFAULT_PLAY_TESTING_CHANNEL = "internal"/)
  assert.match(fastlaneFastfile, /resolved = resolve_play_testing_tracks!/)
  assert.match(fastlaneFastfile, /play_track = resolved\[:phone_track\]/)
  assert.match(fastlaneFastfile, /wear_track = resolved\[:wear_track\]/)
})
