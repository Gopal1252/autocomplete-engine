type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

const currentLevel = (process.env.LOG_LEVEL as Level) ?? 'info';
const isProd = process.env.NODE_ENV === 'production';

function shouldLog(level : Level) : boolean{
    return ORDER[level] >= ORDER[currentLevel];
}

function format(level: Level, component: string, message: string) : string{
    const timestamp = new Date().toISOString();
    if(isProd){
        return JSON.stringify({timestamp, level, component, message});
    }
    return `${timestamp} [${level.toUpperCase()}] [${component}] ${message}`;
}

function emit(level : Level, line : string): void{
    if(level === 'error' || level === 'warn'){
        console.error(line);
    }
    else{
        console.log(line);
    }
}

export function createLogger(component : string){
    return {
        debug : (msg: string) => {
            if(shouldLog('debug')){
                emit('debug',format('debug', component, msg));
            }
        },
        info : (msg: string) => {
            if(shouldLog('info')){
                emit('info',format('info', component, msg));
            }
        },
        warn : (msg: string) => {
            if(shouldLog('warn')){
                emit('warn',format('warn', component, msg));
            }
        },
        error : (msg: string) => {
            if(shouldLog('error')){
                emit('error',format('error', component, msg));
            }
        }
    };
}