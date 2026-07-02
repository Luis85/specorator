// SFC module shim so plain tsc (which cannot parse .vue) accepts .vue imports.
// vue-tsc performs the real template/props typecheck via tsconfig.vue.json.
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}
