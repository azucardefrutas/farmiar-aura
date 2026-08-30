import { randomInt } from 'node:crypto'

export function nextPowerOfTwo(count: number) {
  let size = 1
  while (size < count) size *= 2
  return size
}

export function seedOrder(size: number): number[] {
  if (size < 2 || (size & (size - 1)) !== 0) throw new Error('El tamaño de la llave debe ser potencia de dos.')
  let order = [1, 2]
  while (order.length < size) {
    const nextSize = order.length * 2
    order = order.flatMap((seed) => [seed, nextSize + 1 - seed])
  }
  return order
}

function secureShuffle<T>(values: T[], pick: (maximum: number) => number) {
  const shuffled = [...values]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const selected = pick(index + 1)
    const current = shuffled[index]!
    shuffled[index] = shuffled[selected]!
    shuffled[selected] = current
  }
  return shuffled
}

export function buildBracketSlots(contestantIds: string[], pick: (maximum: number) => number = randomInt): Array<string | null> {
  if (contestantIds.length < 2) throw new Error('Se requieren al menos 2 participantes.')
  if (contestantIds.length > 32) throw new Error('La llave admite hasta 32 participantes.')
  if (new Set(contestantIds).size !== contestantIds.length) throw new Error('No se permiten participantes repetidos.')

  const size = nextPowerOfTwo(contestantIds.length)
  const randomizedSeeds = secureShuffle(contestantIds, pick)
  const entrantsBySeed = Array.from<string | null>({ length: size }).fill(null)
  randomizedSeeds.forEach((contestantId, index) => { entrantsBySeed[index] = contestantId })
  return seedOrder(size).map((seed) => entrantsBySeed[seed - 1] ?? null)
}
