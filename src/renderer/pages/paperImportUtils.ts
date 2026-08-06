const supportedPaperExtension = /\.(pdf|md|markdown)$/i

export function supportedPaperFile(file: Pick<File, 'name'>): boolean {
  return supportedPaperExtension.test(file.name)
}

export function normalizedPaperTitle(value: string): string {
  return value.replace(supportedPaperExtension, '').trim().replace(/\s+/g, ' ').toLowerCase()
}
