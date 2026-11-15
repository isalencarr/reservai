import { db } from '../db/client.ts'
import { createApp } from './app.tsx'

const port = Number(process.env.PORT ?? 3000)

export default { port, fetch: createApp(db()).fetch }

console.log(`reservai em http://localhost:${port} (use <slug>.localhost:${port})`)
