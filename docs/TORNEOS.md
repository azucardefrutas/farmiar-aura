# Operación de Batallas de Aura

## Convocatorias

En Administración → Convocatorias, crea un borrador y elige eliminación directa o batallas libres. La modalidad queda fija para esa edición. Publicar cambia la convocatoria pública sin borrar las anteriores; no se permite cambiarla mientras haya una batalla en curso o pausada. El selector administrativo permite consultar el historial sin cambiar lo que ve el público.

## Eliminación directa

Al cerrar inscripciones se sortean los cruces para 2–32 personas. El siguiente tamaño de llave de potencia de dos determina los pases directos; nadie se descarta por ser un número impar. Con 2 hay final, con 3 el perdedor de semifinal queda tercero y con 4 o más se juega el tercer lugar. Quienes pierden en rondas anteriores comparten lugar (por ejemplo, 5.º para cuartos de final). Una raya significa posición todavía no definida o persona no seleccionada.

El administrador inicia cada encuentro. El tiempo se calcula desde `ends_at` y el servidor rechaza votos tardíos. Cuando vence, se resuelve el resultado; los empates quedan pausados para decisión administrativa. No pueden iniciarse dos batallas simultáneas, aunque haya varios administradores conectados.

En Reglas puedes ajustar segundos y Aura por voto. La duración solo cambia en encuentros pendientes. La propuesta de 15/20 minutos usa el número de inscritos, el duelo por tercero y 20 segundos estimados entre encuentros. No es una promesa: los descansos son manuales y los empates o revanchas alargan la sesión. Con muy pocos o muchos participantes, respetar encuentros cortos puede impedir alcanzar esa duración.

## Batallas libres y revanchas

Las batallas libres se crean eligiendo dos inscritos y duración. Nadie queda eliminado. Al finalizar la convocatoria, el orden es victorias, después votos; empates exactos comparten lugar.

Repetir crea una **revancha de exhibición** con otra identidad y votos nuevos. No borra votos originales, no sustituye ganadores ni modifica la clasificación oficial. Pulsar otra vez mientras esa revancha está pendiente no crea duplicados. Si se necesita sustituir un resultado oficial, hace falta un flujo distinto que compruebe los cruces posteriores.

## Votar u omitir

Se puede votar desde `/votar` y `/live`. Omitir solo cambia la vista local de esa batalla: no hace una petición de voto y no suma puntos. Es posible cambiar de idea antes de finalizar; un voto confirmado no puede cambiarse.

Los votos se agrupan en Postgres, sin truncarse al límite de filas del API. Las escrituras usan HTTPS y los cambios confirmados se anuncian por Supabase Realtime/WebSocket. Las notificaciones se agrupan durante un segundo para evitar recargar por cada voto de una ráfaga. El contador de colaboradores usa Presence real, no valores aleatorios.

## Eliminaciones y límites

Eliminar una inscripción también elimina su foto; se rechaza si tiene encuentros asociados. Una batalla libre o revancha terminada/pendiente se puede eliminar con sus votos. Una batalla de eliminación directa no se borra aisladamente porque rompería sus dependencias: Reiniciar torneo elimina la llave completa y votos, conservando inscritos. La interfaz pide confirmación y estas acciones no tienen deshacer.

Hay validación estricta de datos, consultas parametrizadas, RPC solo de servidor, RLS, límites por usuario y red, tamaño/formato de archivos y encabezados de seguridad. Estos controles **no garantizan protección contra un DDoS volumétrico**; requieren protección del proveedor y capacidad adecuada. La identidad anónima evita duplicados por sesión, no demuestra que dos dispositivos pertenezcan a una sola persona.

## Pruebas

- `npm run test --workspace backend` y `npm run test --workspace frontend`.
- Ambos proyectos deben compilar antes del push.
- `supabase/tests/tournament_modes_rollback.sql`: 1,001 votos, duplicidad, pausa, revanchas, eliminación y conservación de inscritos.
- `supabase/tests/knockout_rollback.sql`: recorrido completo con 2, 3, 5, 6, 8, 17 y 32 participantes.
- Las pruebas SQL deben ejecutarse completas: terminan en ROLLBACK y no conservan datos ni notificaciones de prueba.
