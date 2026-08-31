# Operación: eliminación directa en un escenario

La llave representa avance, no simultaneidad. La agenda indica el orden real de salida.

1. Crear una convocatoria en modalidad **Eliminación directa**.
2. Abrir inscripciones. Pueden coexistir varias convocatorias abiertas; cada persona elige a cuál enviar su formulario.
3. Cerrar inscripciones para generar la llave, incluyendo pases directos cuando no se completa una potencia de dos.
4. Llevar esa convocatoria al escenario. Solo una edición ocupa la votación pública.
5. Pulsar **Iniciar siguiente batalla** cuando ambos participantes estén listos.
6. Resolver todos los cruces de una ronda antes de la siguiente. Tercer lugar antes de la final.

No hay ida/vuelta, repechaje ni doble eliminación. Los perdedores de semifinales solo compiten por el tercer lugar. Las revanchas existentes son exhibiciones opcionales: no revierten eliminaciones ni cambian el podio.

## Tiempo

- El reloj empieza al iniciar la batalla; no corre mientras suben los participantes.
- El vencimiento cierra automáticamente una batalla sin empate. En empate se requiere resolución administrativa.
- No se inicia otra batalla automáticamente: evita consumir el tiempo de votación antes de que los participantes estén listos.
- Con 12 personas: 4 pases directos y 12 batallas reales incluyendo el tercer lugar.
- Recomendación operativa: 75 segundos de votación + unos 20 segundos de transición. Total aproximado: **18 min 40 s**. Es una estimación, no un cierre forzoso; empates, pausas y exhibiciones lo alargan.
- El administrador puede guardar otra duración o usar las propuestas de 15/20 minutos en Reglas y duración. Este cambio no modifica automáticamente la duración configurada.

## Seguridad y sincronización

- Inicio por HTTP autenticado, con bloqueo transaccional del escenario en PostgreSQL.
- El servidor rechaza turnos oficiales fuera de orden, inicios con otra batalla en vivo/pausada y solicitudes cuyo turno esperado ya cambió.
- WebSockets/Supabase Broadcast avisan de cambios confirmados. El cliente vuelve a consultar el estado y no calcula ganadores por su cuenta.
- El catálogo notifica aperturas/cierres/cambios de edición. Reconexión y regreso a la pestaña refrescan los datos.
- El formulario conserva su convocatoria elegida si esta cierra; no se transfiere a otra. El servidor vuelve a comprobar el estado al guardar.
- Las funciones administrativas nuevas solo permiten ejecución desde service_role. No se amplían permisos de escritura del navegador.

## Ensayo real completado el 30 de agosto de 2026

- Convocatoria aislada, 12 bots identificados y 12 batallas de 30 segundos.
- 144 votos de bots + 2 votos externos = **146 votos / 14,600 Aura**.
- Un intento de voto duplicado recibió HTTP 409 y no sumó.
- Podio: BOT 11, BOT 03, BOT 09. Se verificaron avances, reloj, omisión local y actualización de pantallas; el usuario confirmó funcionamiento en su teléfono.
- Peticiones de voto de los bots: mediana 201 ms, p95 304 ms. No representan la latencia completa hasta la pantalla del teléfono.
- Se restauró Batallas de Aura en registro y se eliminaron exclusivamente la convocatoria de ensayo, sus participantes, batallas, votos y 12 cuentas anónimas etiquetadas. La auditoría histórica se conserva.
- Verificación posterior: cero inscripciones, participantes, batallas y votos, sin cuentas de bot del ensayo.

Este ensayo funcional **no es una prueba de carga ni certifica protección frente a DDoS**. Antes de una audiencia grande conviene una prueba de carga acordada, revisar límites de proveedores y decidir si se necesita identidad más fuerte que una sesión anónima (borrar datos o cambiar de dispositivo permite otra identidad).

## Comprobaciones de esta actualización

- Compilación de frontend/backend y 73 pruebas automatizadas aprobadas.
- SQL transaccional: 12 turnos, 4 pases directos, tercer lugar antes de final; rechazo de turno obsoleto, duplicado, fuera de orden y escenario pausado.
- Regresiones de eliminación directa con 2, 3, 5, 6, 8, 12, 17 y 32 participantes.
- Registro explícito en distintas convocatorias, rechazo de duplicados/cierre y permisos de funciones.
- Los escenarios SQL terminan en ROLLBACK: no publican fixtures ni dejan residuos.
- Agenda revisada visualmente en móvil y escritorio, sin desbordamiento horizontal; fixture visual local eliminado antes de publicar.
