import type { Auth } from '../auth/config.ts'
import type { Db } from '../db/client.ts'
import type { Notifier } from '../notify/notifier.ts'

/** O que toda rota precisa ter em mãos: banco, envio de mensagem e sessão. */
export type Deps = { db: Db; notifier: Notifier; auth: Auth }
