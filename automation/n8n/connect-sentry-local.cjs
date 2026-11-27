const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { environment } = require('./sentry-environment.cjs');
const runFile = promisify(execFile);
const runtime = path.resolve(__dirname, '../../scratch/n8n-runtime');
const credentialFile = path.join(runtime, 'private-import/sentry-credential.json');

async function cli(args, config) {
  try {
    const result = await runFile(process.execPath, [path.join(runtime, 'node_modules/n8n/bin/n8n'), ...args], {
      cwd: runtime, env: environment(config, true), windowsHide: true, maxBuffer: 5000000,
    });
    return result.stdout;
  } catch (error) {
    // Avoid exposing execution envelopes or credentials through an exception's captured stdout.
    const output = String(error.stdout || '');
    let reason = 'sin detalle seguro';
    try {
      const result = JSON.parse(output.slice(output.indexOf('{\n')));
      reason = String(result.data?.resultData?.error?.message || result.message || reason);
    } catch {
      reason = output.split('\n').filter(line => /Error:|Workflow execution error|Problem executing/i.test(line)).map(line=>line.slice(0,180)).join(' ').slice(0,300) || reason;
    }
    reason = reason.replace(/sntrys_[A-Za-z0-9_]+|Bearer\s+\S+|[a-f0-9]{40,}/gi, '[redacted]');
    throw new Error(`Falló n8n ${args[0]}: ${reason}`);
  }
}

async function main() {
  const config = JSON.parse(await fs.readFile(path.join(runtime, 'instance.json'), 'utf8'));
  try {
    await fs.access(credentialFile);
    await cli(['import:credentials', `--input=${credentialFile}`], config);
    await fs.unlink(credentialFile);
    console.log('Credencial importada al almacén cifrado de n8n; archivo temporal eliminado.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const workflow = path.join(__dirname, 'boeweb-sentry-local.json');
  const verifyOnly = process.argv[2] === 'verify';
  if (!verifyOnly) await cli(['import:workflow', `--input=${workflow}`], config);
  const output = await cli(['execute', '--id=boewebSentryLocalTriage', '--rawOutput'], config);
  const start = output.indexOf('{\n');
  if (start < 0) throw new Error('n8n no devolvió evidencia de ejecución.');
  const result = JSON.parse(output.slice(start));
  const data = result.data?.resultData;
  if (result.status !== 'success') throw new Error('El workflow no terminó con éxito.');
  const items = data?.runData?.['Resumir incidencias nuevas']?.at(-1)?.data?.main?.[0] || [];
  const evidence = { status: result.status, lastNode: data.lastNodeExecuted, checkedAt: new Date().toISOString(), issues: items.map(item => ({shortId:item.json.shortId,level:item.json.level,count:item.json.count})) };
  await fs.writeFile(path.join(runtime, 'sentry-verified.json'), `${JSON.stringify(evidence,null,2)}\n`);
  console.log(JSON.stringify(evidence));
  if (!verifyOnly) {
    await cli(['publish:workflow', '--id=boewebSentryLocalTriage'], config);
    console.log('Workflow de lectura publicado con intervalo de 15 minutos.');
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
