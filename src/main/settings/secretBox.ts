import { safeStorage } from 'electron'

export type SecretBox = {
  seal(value: string): string
  unseal(value: string): string
}

export function createElectronSecretBox(): SecretBox {
  return {
    seal(value: string): string {
      if (!value) return ''
      if (!safeStorage.isEncryptionAvailable()) return `plain:${Buffer.from(value, 'utf8').toString('base64')}`
      return `safe:${safeStorage.encryptString(value).toString('base64')}`
    },
    unseal(value: string): string {
      if (!value) return ''
      if (value.startsWith('safe:')) {
        return safeStorage.decryptString(Buffer.from(value.slice(5), 'base64'))
      }
      if (value.startsWith('plain:')) {
        return Buffer.from(value.slice(6), 'base64').toString('utf8')
      }
      return value
    }
  }
}
