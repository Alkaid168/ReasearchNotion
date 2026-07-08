export class DifyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string
  ) {
    super(message)
    this.name = 'DifyApiError'
  }
}
