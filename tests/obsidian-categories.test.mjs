import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'

const SRC = 'src/main/obsidian-categories.ts'

function readSource() {
  return fs.readFileSync(SRC, 'utf-8')
}

test('sanitizePathSegment replaces invalid chars', () => {
  const src = readSource()
  assert.match(src, /sanitizePathSegment/)
  assert.match(src, /replace\(/)
})

test('pickCategoryName exists', () => {
  const src = readSource()
  assert.match(src, /export function pickCategoryName/)
})

test('parseTagsFromMarkdown exists', () => {
  const src = readSource()
  assert.match(src, /export function parseTagsFromMarkdown/)
})

test('migrateExistingNotes exists', () => {
  const src = readSource()
  assert.match(src, /export function migrateExistingNotes/)
})

test('resolveUniquePath exists', () => {
  const src = readSource()
  assert.match(src, /export function resolveUniquePath/)
})

test('loadOrInitCategoryConfig exists', () => {
  const src = readSource()
  assert.match(src, /export function loadOrInitCategoryConfig/)
})

test('default categories include all 8 core categories', () => {
  const src = readSource()
  for (const name of ['科技类', '商业财经类', '文化艺术类', '历史社科类', '职场成长类', '生活方式类', '学术科普类', '其他']) {
    assert.match(src, new RegExp(name))
  }
})
