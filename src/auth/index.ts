import { db } from '../db/client.ts'
import { createLogNotifier } from '../notify/log-notifier.ts'
import { createAuth } from './config.ts'

/** Instância fixa, usada pelo CLI da biblioteca para gerar o schema. */
export const auth = createAuth(db(), createLogNotifier())
