/**
 * 共享包入口。
 * engine 与 physics 都从这里导出，客户端和服务端只认这一个入口，
 * 避免两边各自 import 不同文件导致行为漂移。
 */
export * from './physics.ts';
export * from './engine.ts';
