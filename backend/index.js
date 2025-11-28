// ------------------- CONFIGURACIONES GENERALES -------------------
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS
app.use(cors({
  origin: '*', // en producción usa el dominio real de tu frontend
}));

app.use(bodyParser.json());


// ------------------- POSTGRESQL POOL (Render-compatible) -------------------
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 20000,
  ssl: {
    rejectUnauthorized: false,
  }
});

// Verificar conexión
(async () => {
  try {
    const client = await db.connect();
    console.log('✔ Conectado a PostgreSQL (Render)');
    client.release();
  } catch (err) {
    console.error('❌ Error conectando a PostgreSQL:', err);
  }
})();


// ------------------- CARPETA PÚBLICA PARA IMÁGENES -------------------
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// ------------------- MULTER PARA SUBIR IMÁGENES -------------------
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'uploads/'));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + ext);
  }
});
const upload = multer({ storage });


// ------------------- RUTAS ------------------- //

// LOGIN
app.post('/login', async (req, res) => {
  const { usuario, contraseña } = req.body;

  try {
    const result = await db.query(
      'SELECT * FROM usuarios WHERE usuario = $1 AND contraseña = $2',
      [usuario, contraseña]
    );
    res.send({ success: result.rows.length > 0 });
  } catch (err) {
    res.status(500).send(err);
  }
});


// REGISTRAR CLIENTE
app.post('/cliente', async (req, res) => {
  const { nombre_empresa, nombre, telefono, direccion, puesto } = req.body;

  try {
    await db.query(
      `INSERT INTO clientes (nombre_empresa, nombre, telefono, direccion, puesto)
       VALUES ($1, $2, $3, $4, $5)`,
      [nombre_empresa, nombre, telefono, direccion, puesto]
    );
    res.send({ success: true });
  } catch (err) {
    res.status(500).send(err);
  }
});


// OBTENER CLIENTES
app.get('/clientes', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM clientes ORDER BY id DESC');
    res.send(result.rows);
  } catch (err) {
    res.status(500).send(err);
  }
});


// AREAS POR CLIENTE
app.get('/clientes/:id/areas', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM areas_trabajo WHERE cliente_id = $1',
      [req.params.id]
    );
    res.send(result.rows);
  } catch (err) {
    res.status(500).send(err);
  }
});


// AGREGAR ÁREA CON IMAGEN
app.post('/clientes/:id/areas', upload.single('image'), async (req, res) => {
  const { nombre_area, descripcion } = req.body;
  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    await db.query(
      `INSERT INTO areas_trabajo (cliente_id, nombre_area, descripcion, image)
       VALUES ($1, $2, $3, $4)`,
      [req.params.id, nombre_area, descripcion, imagePath]
    );
    res.send({ success: true });
  } catch (err) {
    res.status(500).send(err);
  }
});


// ------------------- PUESTOS ------------------- //

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

    res.send(result.rows);
  } catch (err) {
    res.status(500).send(err);
  }
});


// AGREGAR PUESTO + riesgos + epp
app.post('/areas/:id/puestos', async (req, res) => {
  const { puesto, numero_usuarios, descripcion, riesgos, epp, criterio_epp } = req.body;

  try {
    const insertPuesto = await db.query(
      `INSERT INTO puestos_trabajo (area_id, puesto, numero_usuarios, descripcion, riesgo_id, criterio_epp)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        req.params.id,
        puesto,
        numero_usuarios,
        descripcion,
        riesgos?.[0] || null,
        criterio_epp
      ]
    );

    const puestoId = insertPuesto.rows[0].id;

    if (riesgos?.length > 0) {
      const values = riesgos.map(r => `(${puestoId}, ${r})`).join(',');
      await db.query(`INSERT INTO puestos_riesgos (puesto_id, riesgo_id) VALUES ${values}`);
    }

    if (epp?.length > 0) {
      const values = epp.map(e => `(${puestoId}, ${e})`).join(',');
      await db.query(`INSERT INTO puestos_epp (puesto_id, epp_id) VALUES ${values}`);
    }

    res.send({ success: true });
  } catch (err) {
    res.status(500).send(err);
  }
});


// ------------------- CATÁLOGOS ------------------- //
app.get('/riesgos', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM riesgos_laborales');
    res.send(result.rows);
  } catch (err) {
    res.status(500).send(err);
  }
});

app.get('/epp', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM equipo_proteccion');
    res.send(result.rows);
  } catch (err) {
    res.status(500).send(err);
  }
});


// ------------------- NORMAS ------------------- //
app.get('/normas', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM normas');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/puestos/:puestoId/normas', async (req, res) => {
  const { normaId } = req.body;

  try {
    await db.query(
      'INSERT INTO puestos_normas (puesto_id, norma_id) VALUES ($1, $2)',
      [req.params.puestoId, normaId]
    );
    res.json({ message: 'Norma asignada correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ------------------- SUBOPCIONES ------------------- //
app.get('/nom-subopciones/:nom', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM nom_subopciones WHERE nom = $1',
      [req.params.nom]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ------------------- CUESTIONARIO CON IMAGEN ------------------- //
app.post('/cuestionario', upload.single('image'), async (req, res) => {
  let payload;

  try {
    payload = JSON.parse(req.body.data || '{}');
  } catch (e) {
    return res.status(400).json({ error: 'Datos inválidos' });
  }

  const { puesto_id, nom, subopcion_id, respuestas, observaciones, recomendaciones, recomendaciones_epp } = payload;
  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const infoResult = await client.query(
      `INSERT INTO cuestionarios_info 
      (puesto_id, nom, subopcion_id, observaciones, recomendaciones, recomendaciones_epp, image)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id`,
      [
        puesto_id,
        nom,
        subopcion_id,
        observaciones || null,
        recomendaciones || null,
        recomendaciones_epp || null,
        imagePath
      ]
    );

    const infoId = infoResult.rows[0].id;

    const values = respuestas.map(r =>
      `(${puesto_id}, '${nom}', ${subopcion_id}, ${infoId}, '${r.pregunta}', '${r.respuesta}')`
    ).join(',');

    await client.query(
      `INSERT INTO cuestionarios (puesto_id, nom, subopcion_id, info_id, pregunta, respuesta)
       VALUES ${values}`
    );

    await client.query('COMMIT');
    res.json({ message: 'Cuestionario guardado correctamente', info_id: infoId });

  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});


// PREGUNTAS POR SUBOPCIÓN
app.get('/preguntas/:subopcion_tipo', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM cuestionario_preguntas WHERE subopcion_tipo = $1',
      [req.params.subopcion_tipo]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// INFO ADICIONAL
app.get('/cuestionarios-info/:puesto_id/:nom/:subopcion_id', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM cuestionarios_info WHERE puesto_id = $1 AND nom = $2 AND subopcion_id = $3',
      [req.params.puesto_id, req.params.nom, req.params.subopcion_id]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// OBTENER PUESTO INDIVIDUAL
app.get('/puestos/:id', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM puestos_trabajo WHERE id = $1',
      [req.params.id]
    );
    res.send(result.rows[0] || null);
  } catch (err) {
    res.status(500).send(err);
  }
});


// CUESTIONARIO COMPLETO POR ID
app.get('/cuestionario-completo/:info_id', async (req, res) => {
  try {
    const info = await db.query(
      'SELECT * FROM cuestionarios_info WHERE id = $1',
      [req.params.info_id]
    );

    if (info.rows.length === 0)
      return res.json({ info: null, respuestas: [] });

    const respuestas = await db.query(
      'SELECT pregunta, respuesta FROM cuestionarios WHERE info_id = $1 ORDER BY id',
      [req.params.info_id]
    );

    res.json({
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
    res.status(500).json({ error: err.message });
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

    res.json(result.rows);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ------------------- INICIAR SERVIDOR -------------------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor backend escuchando en el puerto ${PORT}`);
});
