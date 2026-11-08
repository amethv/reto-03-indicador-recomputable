// Cada ejecución crea una instancia nueva; jamás borra sellos anteriores.
process.env.ATENEA_INSTANCE='demo-'+new Date().toISOString().replace(/[^0-9]/g,'');
const {startApp}=await import('./start.mjs');
const app=await startApp();
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit(0);});
