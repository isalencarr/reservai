import { describe, expect, it } from 'bun:test'
import { clientIp, maskEmail, truncateIp } from './privacy.ts'

describe('maskEmail', () => {
  it('deixa só o começo do nome e do domínio', () => {
    expect(maskEmail('carla@belezapura.com.br')).toBe('ca***@b***.com.br')
    expect(maskEmail('ines@studionorte.com')).toBe('in***@s***.com')
  })

  it('não revela nome curto inteiro', () => {
    expect(maskEmail('ze@salao.com')).toBe('z***@s***.com')
  })

  it('aguenta entrada estranha', () => {
    expect(maskEmail('')).toBe('')
    expect(maskEmail(undefined)).toBe('')
    expect(maskEmail('sem-arroba')).toBe('***')
  })
})

describe('truncateIp', () => {
  it('zera o último octeto do IPv4', () => {
    expect(truncateIp('189.45.200.17')).toBe('189.45.200.0')
  })

  it('corta o IPv6 nos quatro primeiros grupos', () => {
    expect(truncateIp('2804:14d:5c59:8d3a:9c1b:2e7f:1:2')).toBe('2804:14d:5c59:8d3a::')
    expect(truncateIp('::1')).toBe('1::')
  })

  it('devolve vazio para lixo', () => {
    expect(truncateIp('')).toBe('')
    expect(truncateIp('sei-la')).toBe('')
    expect(truncateIp('1.2.3')).toBe('')
  })
})

describe('clientIp', () => {
  it('usa o primeiro endereço da cadeia de proxy, já truncado', () => {
    const headers = new Headers({ 'x-forwarded-for': '189.45.200.17, 10.0.0.1' })
    expect(clientIp(headers)).toBe('189.45.200.0')
  })

  it('cai para o cabeçalho alternativo', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '10.1.2.3' }))).toBe('10.1.2.0')
  })

  it('devolve vazio quando não há de onde tirar', () => {
    expect(clientIp(new Headers())).toBe('')
  })
})
