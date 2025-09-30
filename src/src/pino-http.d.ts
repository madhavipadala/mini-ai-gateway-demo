declare module 'pino-http' {
  import type { RequestHandler } from 'express';
  const pinoHttp: (...args: any[]) => RequestHandler;
  export default pinoHttp;
}
