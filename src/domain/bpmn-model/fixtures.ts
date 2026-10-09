import type { ModeloSemantico } from './modelo'

/**
 * Modelos de prueba compartidos por las pruebas del núcleo y por la revisión
 * visual en el laboratorio. Son los tres casos del spike de layout
 * (docs/addons/investigacion-mcp.md §5.1) más un subproceso expandido.
 */

export const MODELO_SIMPLE: ModeloSemantico = {
  pools: [{
    id: 'Solicitudes', nombre: 'Gestión de solicitudes',
    nodos: [
      { id: 'inicio', tipo: 'inicio', nombre: 'Solicitud recibida' },
      { id: 'revisar', tipo: 'tarea_usuario', nombre: 'Revisar solicitud' },
      { id: 'registrar', tipo: 'tarea_servicio', nombre: 'Registrar en sistema' },
      { id: 'fin', tipo: 'fin', nombre: 'Solicitud registrada' },
    ],
  }],
  flujos: [
    { desde: 'inicio', hasta: 'revisar' },
    { desde: 'revisar', hasta: 'registrar' },
    { desde: 'registrar', hasta: 'fin' },
  ],
}

export const MODELO_COMPUERTAS: ModeloSemantico = {
  pools: [{
    id: 'Pedidos', nombre: 'Pedidos',
    nodos: [
      { id: 'S', tipo: 'inicio', nombre: 'Pedido' },
      { id: 'validar', tipo: 'tarea', nombre: 'Validar pedido' },
      { id: 'valido', tipo: 'compuerta_exclusiva', nombre: '¿Válido?' },
      { id: 'abrir', tipo: 'compuerta_paralela' },
      { id: 'facturar', tipo: 'tarea', nombre: 'Facturar' },
      { id: 'enviar', tipo: 'tarea', nombre: 'Preparar envío' },
      { id: 'cerrar', tipo: 'compuerta_paralela' },
      { id: 'rechazar', tipo: 'tarea', nombre: 'Notificar rechazo' },
      { id: 'unir', tipo: 'compuerta_exclusiva' },
      { id: 'E', tipo: 'fin', nombre: 'Fin' },
    ],
  }],
  flujos: [
    { desde: 'S', hasta: 'validar' },
    { desde: 'validar', hasta: 'valido' },
    { desde: 'valido', hasta: 'abrir', nombre: 'Sí' },
    { desde: 'valido', hasta: 'rechazar', nombre: 'No' },
    { desde: 'abrir', hasta: 'facturar' },
    { desde: 'abrir', hasta: 'enviar' },
    { desde: 'facturar', hasta: 'cerrar' },
    { desde: 'enviar', hasta: 'cerrar' },
    { desde: 'cerrar', hasta: 'unir' },
    { desde: 'rechazar', hasta: 'unir' },
    { desde: 'unir', hasta: 'E' },
  ],
}

export const MODELO_POOLS_CARRILES: ModeloSemantico = {
  pools: [
    {
      id: 'Empresa', nombre: 'Empresa',
      carriles: [{ id: 'Comercial', nombre: 'Comercial' }, { id: 'Operaciones', nombre: 'Operaciones' }],
      nodos: [
        { id: 'S', tipo: 'inicio', nombre: 'Inicio', carril: 'Comercial' },
        { id: 'recibir', tipo: 'tarea_recepcion', nombre: 'Recibir pedido', carril: 'Comercial' },
        { id: 'stock', tipo: 'compuerta_exclusiva', nombre: '¿Stock?', carril: 'Comercial' },
        { id: 'preparar', tipo: 'tarea', nombre: 'Preparar pedido', carril: 'Operaciones' },
        { id: 'plazo', tipo: 'evento_borde', nombre: '2 días', evento: 'temporizador', adjunto_a: 'preparar', carril: 'Operaciones' },
        { id: 'escalar', tipo: 'tarea', nombre: 'Escalar retraso', carril: 'Operaciones' },
        { id: 'confirmar', tipo: 'tarea_envio', nombre: 'Confirmar al cliente', carril: 'Comercial' },
        { id: 'E', tipo: 'fin', nombre: 'Fin', carril: 'Comercial' },
      ],
    },
    {
      id: 'Cliente', nombre: 'Cliente',
      nodos: [
        { id: 'cS', tipo: 'inicio' },
        { id: 'pedir', tipo: 'tarea_envio', nombre: 'Enviar pedido' },
        { id: 'esperar', tipo: 'tarea_recepcion', nombre: 'Recibir confirmación' },
        { id: 'cE', tipo: 'fin' },
      ],
    },
  ],
  flujos: [
    { desde: 'S', hasta: 'recibir' },
    { desde: 'recibir', hasta: 'stock' },
    { desde: 'stock', hasta: 'preparar', nombre: 'Sí' },
    { desde: 'stock', hasta: 'confirmar', nombre: 'No' },
    { desde: 'preparar', hasta: 'confirmar' },
    { desde: 'plazo', hasta: 'escalar' },
    { desde: 'escalar', hasta: 'confirmar' },
    { desde: 'confirmar', hasta: 'E' },
    { desde: 'cS', hasta: 'pedir' },
    { desde: 'pedir', hasta: 'esperar' },
    { desde: 'esperar', hasta: 'cE' },
  ],
  mensajes: [
    { desde: 'pedir', hasta: 'recibir', nombre: 'Pedido' },
    { desde: 'confirmar', hasta: 'esperar', nombre: 'Confirmación' },
  ],
}

export const MODELO_SUBPROCESO: ModeloSemantico = {
  pools: [{
    id: 'Alta', nombre: 'Alta de proveedor',
    nodos: [
      { id: 'S', tipo: 'inicio' },
      {
        id: 'verificar', tipo: 'subproceso', nombre: 'Verificar documentación',
        nodos: [
          { id: 'vS', tipo: 'inicio' },
          { id: 'rut', tipo: 'tarea', nombre: 'Revisar RUT' },
          { id: 'banco', tipo: 'tarea', nombre: 'Revisar cuenta bancaria' },
          { id: 'vE', tipo: 'fin' },
        ],
      },
      { id: 'error', tipo: 'evento_borde', evento: 'error', nombre: 'Documento inválido', adjunto_a: 'verificar' },
      { id: 'pedir', tipo: 'tarea', nombre: 'Pedir corrección' },
      { id: 'aprobar', tipo: 'tarea_usuario', nombre: 'Aprobar alta' },
      { id: 'E', tipo: 'fin' },
    ],
  }],
  flujos: [
    { desde: 'S', hasta: 'verificar' },
    { desde: 'vS', hasta: 'rut' },
    { desde: 'rut', hasta: 'banco' },
    { desde: 'banco', hasta: 'vE' },
    { desde: 'verificar', hasta: 'aprobar' },
    { desde: 'error', hasta: 'pedir' },
    { desde: 'pedir', hasta: 'verificar' },
    { desde: 'aprobar', hasta: 'E' },
  ],
}
