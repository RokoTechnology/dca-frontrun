import { Elysia } from 'elysia';
import type { ElysiaSwaggerConfig } from './types';
/**
 * Plugin for [elysia](https://github.com/elysiajs/elysia) that auto-generate Swagger page.
 *
 * @see https://github.com/elysiajs/elysia-swagger
 */
export declare const swagger: <Path extends string = "/swagger">({ provider, scalarVersion, scalarCDN, scalarConfig, documentation, version, excludeStaticFile, path, exclude, swaggerOptions, theme, autoDarkMode, excludeMethods, excludeTags }?: ElysiaSwaggerConfig<Path>) => Promise<Elysia<"", {
    decorator: {};
    store: {};
    derive: {};
    resolve: {};
}, {
    typebox: import("@sinclair/typebox").TModule<{}>;
    error: {};
}, {
    schema: {};
    macro: {};
    macroFn: {};
    parser: {};
}, {}, {
    derive: {};
    resolve: {};
    schema: {};
}, {
    derive: {};
    resolve: {};
    schema: {};
}>>;
export type { ElysiaSwaggerConfig };
export default swagger;
