// El núcleo compartido (src/bpmn/connections) lee `import.meta.env?.DEV`, un
// tipo de Vite. En el servidor no existe: el bundle lo define como `{}`.
interface ImportMeta {
  readonly env?: Record<string, unknown>
}
