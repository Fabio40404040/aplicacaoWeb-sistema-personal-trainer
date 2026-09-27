import { pbkdf2Sync, randomBytes } from 'node:crypto'

const password = process.argv[2]
if (!password) throw new Error('Informe a senha como primeiro argumento.')
const iterations = 210000
const encode = (buffer) => buffer.toString('base64url')
const salt = randomBytes(16)
const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256')
process.stdout.write(`pbkdf2$${iterations}$${encode(salt)}$${encode(hash)}\n`)
