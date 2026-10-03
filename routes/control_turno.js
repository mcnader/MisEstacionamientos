/**
 * routes/control_turno.js
 *
 * Bloquea el cobro de mensuales de EL ANDAMIO cuando en el Control de Estacionamiento
 * (la PC de la playa) no hay un turno abierto. La caja del Control es la que centraliza
 * el dinero, así que un cobro sin turno abierto quedaría sin caja a la cual sumarse.
 *
 * El Control publica su estado en la tabla `control_estado` (turno abierto o cerrado) y la
 * actualiza cada 30 segundos, con la hora del servidor de base de datos como "latido".
 *
 * Reglas (ante la duda, SE DEJA COBRAR — nunca se frena la playa por un problema técnico):
 *   - Solo aplica a la sucursal El Andamio (id 3).
 *   - Si la tabla o la fila no existen todavía: se deja cobrar.
 *   - Si el latido tiene más de 10 minutos (Control apagado o sin internet): se deja cobrar.
 *   - Si el Control informa turno abierto: se deja cobrar.
 *   - Solo si el Control avisó hace poco que NO hay turno abierto: se bloquea.
 *
 * Se apaga con la variable de entorno BLOQUEO_CONTROL_ANDAMIO=off (sin tocar código).
 */

const { getDb } = require('../db/database');

const SUCURSAL_ID_ANDAMIO = 3;
const MAX_MINUTOS_SIN_LATIDO = 10;

async function bloqueoSinTurno(req, res, next) {
  try {
    if (process.env.BLOQUEO_CONTROL_ANDAMIO === 'off') return next();
    const user = req.session && req.session.user;
    if (!user || Number(user.sucursal_id) !== SUCURSAL_ID_ANDAMIO) return next();

    const { rows } = await getDb().query(
      `SELECT turno_abierto,
              EXTRACT(EPOCH FROM (now() - actualizado_en)) / 60 AS minutos
         FROM control_estado
        WHERE sucursal_id = $1`,
      [SUCURSAL_ID_ANDAMIO]
    );
    const estado = rows[0];
    if (!estado) return next();                                   // el Control todavía no publicó nada
    if (Number(estado.minutos) > MAX_MINUTOS_SIN_LATIDO) return next();   // Control sin conexión
    if (estado.turno_abierto) return next();

    return res.status(409).json({
      error: 'No hay un turno abierto en el Control de El Andamio. Abrí el turno en el Control y volvé a registrar el cobro.',
      codigo: 'SIN_TURNO_CONTROL',
    });
  } catch (err) {
    // Si algo falla (por ejemplo, la tabla todavía no existe), no se frena el cobro.
    console.warn('[Bloqueo sin turno] no se pudo verificar, se deja cobrar:', err.message);
    return next();
  }
}

module.exports = { bloqueoSinTurno };
