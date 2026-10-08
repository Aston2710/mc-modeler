import { crearApp } from './app'
import { aManejadorNode } from './nodeAWeb'

/**
 * Entrada de la función de Vercel (Build Output API, lanzador Node). El
 * manejador se construye una vez por instancia y se reutiliza entre
 * invocaciones: las tools no guardan estado propio, solo el cliente de
 * Supabase de cada petición.
 */
export default aManejadorNode(crearApp())
