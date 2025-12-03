// backend_server.js
// Backend Express optimizado, UTF-8 garantizado, PostgreSQL pool, seguridad básica y manejo seguro de inserción masiva.
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Pool } = require('pg');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3001;

// ------------------- MIDDLEWARES -------------------
app.use(helmet());
app.use(morgan('combined'));
app.use(cors({ origin: '*' })); // ajustar en producción

// Forzar UTF-8 en request/response
app.use(express.json({ type: 'application/json; charset=utf-8', limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

// ------------------- POSTGRESQL POOL -------------------
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

(async () => {
  try {
    const client = await db.connect();
    console.log('✔ Conectado a PostgreSQL');
    client.release();
  } catch (err) {
    console.error('❌ Error conectando a PostgreSQL:', err.message || err);
  }
})();

// ------------------- STATIC UPLOADS -------------------
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ------------------- MULTER -------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads/')),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// ------------------- HELPERS -------------------
function handleServerError(res, err) {
  console.error(err && err.stack ? err.stack : err);
  return res.status(500).json({ error: 'Error en el servidor' });
}

// ------------------- RUTAS -------------------

// LOGIN
app.post('/login', async (req, res) => {
  try {
    const { usuario, password } = req.body;
    const result = await db.query('SELECT id, usuario FROM usuarios WHERE usuario = $1 AND password = $2', [usuario, password]);
    return res.json({ success: result.rows.length > 0, user: result.rows[0] || null });
  } catch (err) {
    return handleServerError(res, err);
  }
});

// REGISTRAR CLIENTE
app.post('/cliente', async (req, res) => {
  try {
    const { nombre_empresa, nombre, telefono, direccion, puesto } = req.body;
    await db.query(
      `INSERT INTO clientes (nombre_empresa, nombre, telefono, direccion, puesto)
       VALUES ($1, $2, $3, $4, $5)`,
      [nombre_empresa, nombre, telefono, direccion, puesto]
    );
    return res.json({ success: true });
  } catch (err) {
    return handleServerError(res, err);
  }
});

// OBTENER CLIENTES
app.get('/clientes', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM clientes ORDER BY id DESC');
    return res.json(result.rows);
  } catch (err) {
    return handleServerError(res, err);
  }
});

// AREAS POR CLIENTE
app.get('/clientes/:id/areas', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM areas_trabajo WHERE cliente_id = $1', [req.params.id]);
    return res.json(result.rows);
  } catch (err) {
    return handleServerError(res, err);
  }
});

// AGREGAR ÁREA CON IMAGEN
app.post('/clientes/:id/areas', upload.single('image'), async (req, res) => {
  try {
    const { nombre_area, descripcion } = req.body;
    const imagePath = req.file ? `/uploads/${req.file.filename}` : null;
    await db.query(
      `INSERT INTO areas_trabajo (cliente_id, nombre_area, descripcion, image)
       VALUES ($1, $2, $3, $4)`,
      [req.params.id, nombre_area, descripcion, imagePath]
    );
    return res.json({ success: true });
  } catch (err) {
    return handleServerError(res, err);
  }
});

// PUESTOS POR ÁREA
app.get('/areas/:id/puestos', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        p.id,
        p.puesto,
        p.numero_usuarios,
        p.descripcion,
        p.criterio_epp,
        STRING_AGG(DISTINCT r.nombre, ', ') AS riesgos,
        STRING_AGG(DISTINCT e.nombre, ', ') AS epp
      FROM puestos_trabajo p
      LEFT JOIN puestos_riesgos pr ON p.id = pr.puesto_id
      LEFT JOIN riesgos_laborales r ON pr.riesgo_id = r.id
      LEFT JOIN puestos_epp pe ON p.id = pe.puesto_id
      LEFT JOIN equipo_proteccion e ON pe.epp_id = e.id
      WHERE p.area_id = $1
      GROUP BY p.id
    `, [req.params.id]);
    return res.json(result.rows);
  } catch (err) {
    return handleServerError(res, err);
  }
});

// AGREGAR PUESTO + riesgos + epp
app.post('/areas/:id/puestos', async (req, res) => {
  const client = await db.connect();
  try {
    const { puesto, numero_usuarios, descripcion, riesgos = [], epp = [], criterio_epp } = req.body;
    await client.query('BEGIN');
    const insertPuesto = await client.query(
      `INSERT INTO puestos_trabajo (area_id, puesto, numero_usuarios, descripcion, criterio_epp)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.params.id, puesto, numero_usuarios, descripcion, criterio_epp]
    );
    const puestoId = insertPuesto.rows[0].id;

    if (Array.isArray(riesgos) && riesgos.length > 0) {
      const params = [];
      const placeholders = riesgos.map((r, i) => {
        params.push(puestoId, r);
        const idx = params.length - 1;
        // placeholder pair: ($1, $2), ($3, $4), ...
        return `($${idx - 1}, $${idx})`;
      }).join(',');
      await client.query(`INSERT INTO puestos_riesgos (puesto_id, riesgo_id) VALUES ${placeholders}`, params);
    }

    if (Array.isArray(epp) && epp.length > 0) {
      const params = [];
      const placeholders = epp.map((e, i) => {
        params.push(puestoId, e);
        const idx = params.length - 1;
        return `($${idx - 1}, $${idx})`;
      }).join(',');
      await client.query(`INSERT INTO puestos_epp (puesto_id, epp_id) VALUES ${placeholders}`, params);
    }

    await client.query('COMMIT');
    return res.json({ success: true, id: puestoId });
  } catch (err) {
    await client.query('ROLLBACK');
    return handleServerError(res, err);
  } finally {
    client.release();
  }
});

// CATÁLOGOS
app.get('/riesgos', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM riesgos_laborales');
    return res.json(result.rows);
  } catch (err) {
    return handleServerError(res, err);
  }
});

app.get('/epp', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM equipo_proteccion');
    return res.json(result.rows);
  } catch (err) {
    return handleServerError(res, err);
  }
});

// NORMAS
app.get('/normas', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM normas');
    return res.json(result.rows);
  } catch (err) {
    return handleServerError(res, err);
  }
});

app.get('/puestos/:puestoId/normas', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT n.*
       FROM puestos_normas pn
       JOIN normas n ON pn.norma_id = n.id
       WHERE pn.puesto_id = $1`,
      [req.params.puestoId]
    );
    return res.json(result.rows);
  } catch (err) {
    return handleServerError(res, err);
  }
});

app.post('/puestos/:puestoId/normas', async (req, res) => {
  try {
    const { normaId } = req.body;
    await db.query('INSERT INTO puestos_normas (puesto_id, norma_id) VALUES ($1, $2)', [req.params.puestoId, normaId]);
    return res.json({ message: 'Norma asignada correctamente' });
  } catch (err) {
    return handleServerError(res, err);
  }
});

// SUBOPCIONES
app.get('/nom-subopciones/:nom', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM nom_subopciones WHERE nom = $1', [req.params.nom]);
    return res.json(result.rows);
  } catch (err) {
    return handleServerError(res, err);
  }
});

// CUESTIONARIO CON IMAGEN (inserción masiva segura)
app.post('/cuestionario', upload.single('image'), async (req, res) => {
  let payload;
  try {
    payload = JSON.parse(req.body.data || '{}');
  } catch (e) {
    return res.status(400).json({ error: 'Datos inválidos' });
  }

  const { puesto_id, nom, subopcion_id, respuestas = [], observaciones, recomendaciones, recomendaciones_epp } = payload;
  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const infoResult = await client.query(
      `INSERT INTO cuestionarios_info (puesto_id, nom, subopcion_id, observaciones, recomendaciones, recomendaciones_epp, image)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [puesto_id, nom, subopcion_id, observaciones || null, recomendaciones || null, recomendaciones_epp || null, imagePath]
    );

    const infoId = infoResult.rows[0].id;

    if (Array.isArray(respuestas) && respuestas.length > 0) {
      // Construir consulta parametrizada para insertar múltiples filas
      // columnas: puesto_id, nom, subopcion_id, info_id, pregunta, respuesta
      const params = [];
      const placeholders = respuestas.map((r, i) => {
        const base = i * 6; // 6 parámetros por fila
        params.push(puesto_id, nom, subopcion_id, infoId, r.pregunta, r.respuesta);
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
      }).join(',');

      const query = `INSERT INTO cuestionarios (puesto_id, nom, subopcion_id, info_id, pregunta, respuesta) VALUES ${placeholders}`;
      await client.query(query, params);
    }

    await client.query('COMMIT');
    return res.json({ message: 'Cuestionario guardado correctamente', info_id: infoId });
  } catch (err) {
    await client.query('ROLLBACK');
    return handleServerError(res, err);
  } finally {
    client.release();
  }
});

// PREGUNTAS POR SUBOPCIÓN
app.get('/preguntas/:subopcion_tipo', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM cuestionario_preguntas WHERE subopcion_tipo = $1', [req.params.subopcion_tipo]);
    return res.json(result.rows);
  } catch (err) {
    return handleServerError(res, err);
  }
});

// INFO ADICIONAL
app.get('/cuestionarios-info/:puesto_id/:nom/:subopcion_id', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM cuestionarios_info WHERE puesto_id = $1 AND nom = $2 AND subopcion_id = $3', [req.params.puesto_id, req.params.nom, req.params.subopcion_id]);
    return res.json(result.rows[0] || null);
  } catch (err) {
    return handleServerError(res, err);
  }
});

// OBTENER PUESTO INDIVIDUAL
app.get('/puestos/:id', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM puestos_trabajo WHERE id = $1', [req.params.id]);
    return res.json(result.rows[0] || null);
  } catch (err) {
    return handleServerError(res, err);
  }
});

// CUESTIONARIO COMPLETO POR ID
app.get('/cuestionario-completo/:info_id', async (req, res) => {
  try {
    const info = await db.query('SELECT * FROM cuestionarios_info WHERE id = $1', [req.params.info_id]);
    if (info.rows.length === 0) return res.json({ info: null, respuestas: [] });
    const respuestas = await db.query('SELECT pregunta, respuesta FROM cuestionarios WHERE info_id = $1 ORDER BY id', [req.params.info_id]);

    return res.json({
      info: {
        observaciones: info.rows[0].observaciones || 'N/A',
        recomendaciones: info.rows[0].recomendaciones || 'N/A',
        recomendaciones_epp: info.rows[0].recomendaciones_epp || 'N/A',
        image: info.rows[0].image || null,
        created_at: info.rows[0].created_at
      },
      respuestas: respuestas.rows
    });
  } catch (err) {
    return handleServerError(res, err);
  }
});

// LISTA DE CUESTIONARIOS POR PUESTO
app.get('/puestos/:id/cuestionarios', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        ci.id,
        ci.puesto_id,
        ci.nom,
        ns.subopcion AS subopcion_nombre,
        ci.subopcion_id,
        ci.created_at,
        ci.image,
        COUNT(c.id) AS num_respuestas
      FROM cuestionarios_info ci
      LEFT JOIN nom_subopciones ns ON ci.subopcion_id = ns.id
      LEFT JOIN cuestionarios c ON ci.id = c.info_id
      WHERE ci.puesto_id = $1
      GROUP BY ci.id, ns.subopcion
      ORDER BY ci.created_at DESC
    `, [req.params.id]);

    return res.json(result.rows);
  } catch (err) {
    return handleServerError(res, err);
  }
});

// ERROR 404
app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// INICIAR SERVIDOR
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor escuchando en puerto ${PORT}`));
