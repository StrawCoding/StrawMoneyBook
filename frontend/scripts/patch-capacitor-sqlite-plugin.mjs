import fs from 'node:fs'
import path from 'node:path'

const filePath = path.resolve(
  process.cwd(),
  'node_modules/@capacitor-community/sqlite/android/src/main/java/com/getcapacitor/community/database/sqlite/CapacitorSQLitePlugin.java',
)

if (!fs.existsSync(filePath)) {
  console.log('[patch-sqlite] plugin file not found, skipped')
  process.exit(0)
}

let source = fs.readFileSync(filePath, 'utf8')
let next = source

if (!next.includes('import java.io.PrintWriter;')) {
  next = next.replace('import org.json.JSONObject;\n', 'import org.json.JSONObject;\nimport java.io.PrintWriter;\nimport java.io.StringWriter;\n')
}

next = next.replace(
  '            loadMessage = "CapacitorSQLitePlugin: " + e.getMessage();\n            Log.e(TAG, loadMessage);',
  `            String message = e.getMessage();
            if (message == null || message.isEmpty()) {
                StringWriter sw = new StringWriter();
                PrintWriter pw = new PrintWriter(sw);
                e.printStackTrace(pw);
                message = sw.toString();
            }
            loadMessage = "CapacitorSQLitePlugin: " + message;
            Log.e(TAG, loadMessage);`,
)

if (!next.includes('if (getConfig() == null || getConfig().getConfigJSON() == null) {')) {
  next = next.replace(
    '        SqliteConfig config = new SqliteConfig();\n        JSONObject pConfig = getConfig().getConfigJSON();',
    `        SqliteConfig config = new SqliteConfig();
        if (getConfig() == null || getConfig().getConfigJSON() == null) {
            return config;
        }
        JSONObject pConfig = getConfig().getConfigJSON();`,
  )
}

if (next !== source) {
  fs.writeFileSync(filePath, next, 'utf8')
  console.log('[patch-sqlite] applied')
} else {
  console.log('[patch-sqlite] already patched')
}
