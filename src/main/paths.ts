import { app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'

export function appRoots(): string[] {
  // getAppPath varies with how the app is launched (packaged, `electron .`,
  // `electron out/main/index.js`), so walk up from it and try cwd too.
  const appPath = app.getAppPath()
  return [appPath, join(appPath, '..', '..'), process.cwd(), process.resourcesPath ?? ''].filter(
    Boolean
  )
}

export function modelsDir(): string {
  for (const r of appRoots()) {
    if (existsSync(join(r, 'models'))) return join(r, 'models')
  }
  return join(app.getPath('userData'), 'models')
}
