// ------------------- CONFIGURACIONES GENERALES -------------------
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const path = require("path");
const multer = require("multer");
const fs = require("fs"); // ✅ AÑADIDO

const app = express();

const PORT = process.env.PORT || 3001;

// CORS
app.use(
  cors({
    origin: "*",
  }),
);

app.use(bodyParser.json());

// ------------------- POSTGRESQL POOL -------------------
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Verificar conexión
(async () => {
  try {
    const client = await db.connect();
    console.log("✔ Conectado a PostgreSQL (Render)");
    client.release();
  } catch (err) {
    console.error("❌ Error conectando a PostgreSQL:", err);
  }
})();

// ------------------- 📁 FIX IMPORTANTE: UPLOADS UNIFICADO -------------------

const uploadsDir = process.env.RENDER
  ? "/uploads"
  : path.join(__dirname, "uploads");

// ✅ asegurar que exista en Render/local
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use("/uploads", express.static(uploadsDir));

// Test directo
app.get("/test-upload", (req, res) => {
  res.sendFile(path.join(uploadsDir, "1783093855682.jpg"));
});

// ------------------- MULTER CORREGIDO -------------------
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir); // ✅ MISMA CARPETA QUE EXPRESS
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + ext);
  },
});

app.get("/test-uploads", (req, res) => {
  fs.readdir(uploadsDir, (err, files) => {
    if (err) {
      return res.status(500).json(err);
    }

    res.json(files);
  });
});

const fileFilter = (req, file, cb) => {
  const permitidos = ["image/jpeg", "image/jpg", "application/pdf"];

  if (permitidos.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Tipo de archivo no permitido"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
});

// ------------------- RUTAS (TODO IGUAL) -------------------

// LOGIN
app.post("/login", async (req, res) => {
  try {
    const { usuario, password } = req.body;

    const result = await db.query(
      "SELECT * FROM usuarios WHERE usuario = $1 AND password = $2",
      [usuario, password],
    );

    res.json({
      success: result.rows.length > 0,
      usuario: result.rows[0] || null,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false });
  }
});

// REGISTRAR CLIENTE
app.post("/cliente", async (req, res) => {
  try {
    const { nombre_empresa, nombre, telefono, direccion, puesto, usuario_id } =
      req.body;

    await db.query(
      `INSERT INTO clientes
      (nombre_empresa, nombre, telefono, direccion, puesto, usuario_id)
      VALUES ($1, $2, $3, $4, $5, $6)`,
      [nombre_empresa, nombre, telefono, direccion, puesto, usuario_id],
    );

    res.json({ success: true });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false });
  }
});

// OBTENER CLIENTES
app.get("/clientes/:usuarioId", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM clientes WHERE usuario_id = $1 ORDER BY id DESC",
      [req.params.usuarioId],
    );

    res.json(result.rows);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Error al obtener clientes" });
  }
});

// AREAS POR CLIENTE
app.get("/clientes/:id/areas", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM areas_trabajo WHERE cliente_id = $1",
      [req.params.id],
    );
    res.send(result.rows);
  } catch (err) {
    res.status(500).send(err);
  }
});

// AGREGAR ÁREA CON IMAGEN
app.post("/clientes/:id/areas", upload.single("image"), async (req, res) => {
  const { nombre_area, descripcion, encargado, contacto } = req.body;

  try {
    const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

    const result = await db.query(
      `INSERT INTO areas_trabajo
      (cliente_id, nombre_area, descripcion, encargado, contacto, image)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [req.params.id, nombre_area, descripcion, encargado, contacto, imagePath],
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error al registrar el área");
  }
});

// ------------------- EL RESTO DE TUS RUTAS SIGUEN IGUAL -------------------
// (NO SE ELIMINÓ NINGUNA)

// ... TODO TU CÓDIGO ORIGINAL AQUÍ SIN CAMBIOS ...

// ------------------- INICIAR SERVIDOR -------------------

// ------------------- PUESTOS ------------------- //

// PUESTOS POR ÁREA
app.get("/areas/:id/puestos", async (req, res) => {
  try {
    const result = await db.query(
      `
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
    `,
      [req.params.id],
    );

    res.send(result.rows);
  } catch (err) {
    res.status(500).send(err);
  }
});

// AGREGAR PUESTO + riesgos + epp
app.post("/areas/:id/puestos", async (req, res) => {
  const { puesto, numero_usuarios, descripcion, riesgos, epp, criterio_epp } =
    req.body;

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
        criterio_epp,
      ],
    );

    const puestoId = insertPuesto.rows[0].id;

    if (riesgos?.length > 0) {
      const values = riesgos.map((r) => `(${puestoId}, ${r})`).join(",");
      await db.query(
        `INSERT INTO puestos_riesgos (puesto_id, riesgo_id) VALUES ${values}`,
      );
    }

    if (epp?.length > 0) {
      const values = epp.map((e) => `(${puestoId}, ${e})`).join(",");
      await db.query(
        `INSERT INTO puestos_epp (puesto_id, epp_id) VALUES ${values}`,
      );
    }

    res.send({ success: true });
  } catch (err) {
    res.status(500).send(err);
  }
});

// ------------------- CATÁLOGOS ------------------- //
app.get("/riesgos", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM riesgos_laborales");
    res.send(result.rows);
  } catch (err) {
    res.status(500).send(err);
  }
});

app.get("/epp", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        ep.id,
        ep.nombre,
        ep.categoria_id,
        c.nombre AS categoria
      FROM equipo_proteccion ep
      INNER JOIN categorias_epp c
        ON ep.categoria_id = c.id
      ORDER BY c.nombre, ep.nombre
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err.message,
    });
  }
});

// ------------------- NORMAS ------------------- //
app.get("/normas", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM normas");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/puestos/:puestoId/normas", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT n.*
       FROM puestos_normas pn
       JOIN normas n ON pn.norma_id = n.id
       WHERE pn.puesto_id = $1`,
      [req.params.puestoId],
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/puestos/:puestoId/normas", async (req, res) => {
  const { normaId } = req.body;

  try {
    await db.query(
      "INSERT INTO puestos_normas (puesto_id, norma_id) VALUES ($1, $2)",
      [req.params.puestoId, normaId],
    );
    res.json({ message: "Norma asignada correctamente" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------- SUBOPCIONES ------------------- //
app.get("/nom-subopciones/:nom", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM nom_subopciones WHERE nom = $1",
      [req.params.nom],
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------- CUESTIONARIO CON IMAGEN ------------------- //
app.post("/cuestionario", upload.single("image"), async (req, res) => {
  console.log("===== INICIO /cuestionario =====");

  let payload;

  try {
    payload = JSON.parse(req.body.data || "{}");
    console.log("Payload recibido:", payload);
  } catch (e) {
    console.log("Error parseando payload:", e);
    return res.status(400).json({ error: "Datos inválidos" });
  }

  const {
    puesto_id,
    nom,
    subopcion_id,
    respuestas,
    observaciones,
    recomendaciones,
    recomendaciones_epp,
  } = payload;

  console.log("Imagen:", req.file);
  console.log("req.body:", req.body);
  console.log("req.file:", req.file);

  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

  const client = await db.connect();

  try {
    console.log("BEGIN");
    await client.query("BEGIN");

    console.log("Insertando cuestionarios_info");

    const infoResult = await client.query(
      `INSERT INTO cuestionarios_info
      (puesto_id, nom, subopcion_id, observaciones, recomendaciones, recomendaciones_epp, image)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id`,
      [
        puesto_id,
        nom,
        subopcion_id,
        observaciones || null,
        recomendaciones || null,
        recomendaciones_epp || null,
        imagePath,
      ],
    );

    console.log("Insert OK");

    const infoId = infoResult.rows[0].id;

    console.log("infoId:", infoId);

    const values = respuestas
      .map(
        (r) =>
          `(${puesto_id}, '${nom}', ${subopcion_id}, ${infoId}, '${r.pregunta}', '${r.respuesta}')`,
      )
      .join(",");

    console.log("Insertando respuestas");

    await client.query(
      `INSERT INTO cuestionarios
      (puesto_id, nom, subopcion_id, info_id, pregunta, respuesta)
      VALUES ${values}`,
    );

    console.log("COMMIT");

    await client.query("COMMIT");

    res.json({
      message: "ok",
      info_id: infoId,
    });
  } catch (err) {
    console.log("ERROR SQL");
    console.log(err);

    await client.query("ROLLBACK");

    res.status(500).json({
      error: err.message,
    });
  } finally {
    client.release();
  }
});

// SUBIR DOCUMENTOS (ARP / FICHA)

app.post("/documentos", upload.single("archivo"), async (req, res) => {
  console.log("BODY:");
  console.log(req.body);

  console.log("FILE:");
  console.log(req.file);

  try {
    const { cuestionario_info_id, tipo } = req.body;

    if (!req.file) {
      return res.status(400).json({
        error: "No se recibió archivo",
      });
    }
    console.log("Archivo recibido:");
    console.log(req.file);

    const rutaFisica = path.join(uploadsDir, req.file.filename);
    console.log("Ruta BD:", `/uploads/${req.file.filename}`);

    console.log("Ruta física:", rutaFisica);

    console.log("¿Existe?", fs.existsSync(rutaFisica));

    const ruta = `/uploads/${req.file.filename}`;

    const result = await db.query(
      `INSERT INTO documentos_cuestionario
        (
          cuestionario_info_id,
          tipo,
          archivo
        )
        VALUES ($1,$2,$3)
        RETURNING *`,

      [cuestionario_info_id, tipo, ruta],
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      error: error.message,
    });
  }
});

// PREGUNTAS POR SUBOPCIÓN
app.get("/preguntas/:subopcion_tipo", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM cuestionario_preguntas WHERE subopcion_tipo = $1",
      [req.params.subopcion_tipo],
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// INFO ADICIONAL
app.get(
  "/cuestionarios-info/:puesto_id/:nom/:subopcion_id",
  async (req, res) => {
    try {
      const result = await db.query(
        "SELECT * FROM cuestionarios_info WHERE puesto_id = $1 AND nom = $2 AND subopcion_id = $3",
        [req.params.puesto_id, req.params.nom, req.params.subopcion_id],
      );
      res.json(result.rows[0] || null);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

// OBTENER PUESTO INDIVIDUAL
app.get("/puestos/:id", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM puestos_trabajo WHERE id = $1",
      [req.params.id],
    );
    res.send(result.rows[0] || null);
  } catch (err) {
    res.status(500).send(err);
  }
});

// CUESTIONARIO COMPLETO POR ID
app.get("/cuestionario-completo/:info_id", async (req, res) => {
  try {
    const info = await db.query(
      "SELECT * FROM cuestionarios_info WHERE id = $1",
      [req.params.info_id],
    );

    if (info.rows.length === 0) return res.json({ info: null, respuestas: [] });

    const respuestas = await db.query(
      "SELECT pregunta, respuesta FROM cuestionarios WHERE info_id = $1 ORDER BY id",
      [req.params.info_id],
    );

    res.json({
      info: {
        observaciones: info.rows[0].observaciones || "N/A",
        recomendaciones: info.rows[0].recomendaciones || "N/A",
        recomendaciones_epp: info.rows[0].recomendaciones_epp || "N/A",
        image: info.rows[0].image || null,
        created_at: info.rows[0].created_at,
      },
      respuestas: respuestas.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// LISTA DE CUESTIONARIOS POR PUESTO
app.get("/puestos/:id/cuestionarios", async (req, res) => {
  try {
    const result = await db.query(
      `
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
    `,
      [req.params.id],
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// ===============================
// REPORTE CONSOLIDADO NOM
// Cliente + Área + Puesto
// ===============================
app.get("/reporte-consolidado", async (req, res) => {
  try {
    const puestoId = parseInt(req.query.puestoId, 10);

    if (!puestoId) {
      return res.status(400).json({ message: "puestoId requerido" });
    }

    const sql = `
      SELECT
    c.id AS cliente_id,
    c.nombre_empresa AS cliente_nombre,
    a.id AS area_id,
    a.nombre_area AS area_nombre,
    p.id AS puesto_id,
    p.puesto AS puesto_nombre,

    ci.id AS info_id,
    ci.nom,
    ci.created_at,
    ci.image,

    arp.archivo AS arp,
    ficha.archivo AS ficha,

    ci.observaciones AS naturaleza_emision,
    ci.recomendaciones AS descripcion_operacion,
    ci.recomendaciones_epp AS epp_recomendado,

    ns.subopcion,

    q.pregunta,
    q.respuesta

FROM puestos_trabajo p

JOIN areas_trabajo a
ON a.id=p.area_id

JOIN clientes c
ON c.id=a.cliente_id

JOIN cuestionarios_info ci
ON ci.puesto_id=p.id

JOIN cuestionarios q
ON q.info_id=ci.id

LEFT JOIN nom_subopciones ns
ON ns.id=ci.subopcion_id

LEFT JOIN documentos_cuestionario arp
ON arp.cuestionario_info_id=ci.id
AND arp.tipo='ARP'

LEFT JOIN documentos_cuestionario ficha
ON ficha.cuestionario_info_id=ci.id
AND ficha.tipo='FICHA'

WHERE p.id=$1

ORDER BY ci.created_at;
    `;

    const { rows } = await db.query(sql, [puestoId]);

    res.json(rows);
  } catch (error) {
    console.error("❌ Error reporte consolidado:", error.message);
    res.status(500).json({
      message: "Error interno en reporte consolidado",
      error: error.message,
    });
  }
});

// ------------------- ELIMINAR CLIENTE COMPLETO -------------------
// ------------------- ELIMINAR CLIENTE COMPLETO -------------------
app.delete("/clientes/:id", async (req, res) => {
  const clienteId = req.params.id;
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    // ✅ Eliminar inventario relacionado con el cliente
    await client.query("DELETE FROM inventario WHERE cliente_id = $1", [
      clienteId,
    ]);

    // 1️⃣ Obtener áreas del cliente
    const areas = await client.query(
      "SELECT id FROM areas_trabajo WHERE cliente_id = $1",
      [clienteId],
    );

    for (const area of areas.rows) {
      // 2️⃣ Obtener puestos del área
      const puestos = await client.query(
        "SELECT id FROM puestos_trabajo WHERE area_id = $1",
        [area.id],
      );

      for (const puesto of puestos.rows) {
        // 3️⃣ Eliminar relaciones del puesto
        await client.query("DELETE FROM puestos_riesgos WHERE puesto_id = $1", [
          puesto.id,
        ]);

        await client.query("DELETE FROM puestos_epp WHERE puesto_id = $1", [
          puesto.id,
        ]);

        await client.query("DELETE FROM puestos_normas WHERE puesto_id = $1", [
          puesto.id,
        ]);

        // 4️⃣ Obtener cuestionarios_info
        const infos = await client.query(
          "SELECT id FROM cuestionarios_info WHERE puesto_id = $1",
          [puesto.id],
        );

        for (const info of infos.rows) {
          // 5️⃣ Eliminar respuestas
          await client.query("DELETE FROM cuestionarios WHERE info_id = $1", [
            info.id,
          ]);

          // ✅ Eliminar documentos del cuestionario
          await client.query(
            "DELETE FROM documentos_cuestionario WHERE cuestionario_info_id = $1",
            [info.id],
          );
        }

        // 6️⃣ Eliminar info cuestionarios
        await client.query(
          "DELETE FROM cuestionarios_info WHERE puesto_id = $1",
          [puesto.id],
        );

        // 7️⃣ Eliminar puesto
        await client.query("DELETE FROM puestos_trabajo WHERE id = $1", [
          puesto.id,
        ]);
      }

      // 8️⃣ Eliminar área
      await client.query("DELETE FROM areas_trabajo WHERE id = $1", [area.id]);
    }

    // 9️⃣ Eliminar cliente
    await client.query("DELETE FROM clientes WHERE id = $1", [clienteId]);

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Cliente eliminado correctamente",
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("❌ Error eliminando cliente:", error);

    res.status(500).json({
      success: false,
      message: error.message,
      detail: error.detail,
      table: error.table,
      constraint: error.constraint,
    });
  } finally {
    client.release();
  }
});

//Crear inventario

app.post("/inventario", async (req, res) => {
  try {
    const {
      clave_producto,
      nombre_producto,
      marca,
      tipo_producto,
      descripcion,
      cantidad_min,
      cantidad_max,
      cantidad_total,
      usuario_id,
      cliente_id,
      area_id,
      puesto_id,
    } = req.body;

    const result = await db.query(
      `INSERT INTO inventario
      (
        clave_producto,
        nombre_producto,
        marca,
        descripcion,
        tipo_producto,
        cantidad_min,
        cantidad_max,
        cantidad_total,
        usuario_id,
        cliente_id,
        area_id,
        puesto_id
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *`,
      [
        clave_producto,
        nombre_producto,
        marca,
        tipo_producto,
        descripcion,
        cantidad_min,
        cantidad_max,
        cantidad_total,
        usuario_id,
        cliente_id,
        area_id,
        puesto_id,
      ],
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      error: error.message,
    });
  }
});

//Listar Inventario
app.get("/inventario/:clienteId", async (req, res) => {
  try {
    const result = await db.query(
      `
      SELECT
        i.*,
        c.nombre_empresa,
        a.nombre_area,
        p.puesto
      FROM inventario i
      JOIN clientes c ON c.id = i.cliente_id
      JOIN areas_trabajo a ON a.id = i.area_id
      JOIN puestos_trabajo p ON p.id = i.puesto_id
      WHERE i.cliente_id = $1
      ORDER BY i.id DESC
      `,
      [req.params.clienteId],
    );

    res.json(result.rows);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      error: error.message,
    });
  }
});

app.put("/inventario/:id", async (req, res) => {
  try {
    const {
      clave_producto,
      nombre_producto,
      tipo_producto,
      marca,
      descripcion,
      cantidad_min,
      cantidad_max,
      cantidad_total,
    } = req.body;

    const result = await db.query(
      `
      UPDATE inventario
      SET
        clave_producto = $1,
        nombre_producto = $2,
        marca = $3,
        descripcion = $4,
        cantidad_min = $5,
        cantidad_max = $6,
        cantidad_total = $7,
        tipo_producto = $8
      WHERE id = $9
      RETURNING *
      `,
      [
        clave_producto,
        nombre_producto,
        marca,
        descripcion,
        cantidad_min,
        cantidad_max,
        cantidad_total,
        tipo_producto,
        req.params.id,
      ],
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      error: error.message,
    });
  }
});

// ------------------- INICIAR SERVIDOR -------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor backend escuchando en el puerto ${PORT}`);
});
