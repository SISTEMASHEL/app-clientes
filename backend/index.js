// ------------------- CONFIGURACIONES GENERALES -------------------
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const path = require("path");
const multer = require("multer");
const fs = require("fs");

const app = express();

const PORT = process.env.PORT || 3001;

// =====================================================
// CORS GLOBAL - WEB / ANDROID / IOS
// =====================================================

const corsOptions = {
  origin: "*",

  methods: [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ],

  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
  ],

  optionsSuccessStatus: 204,
};

// =====================================================
// MIDDLEWARE MANUAL CORS
// DEBE IR ANTES DE TODAS LAS RUTAS
// =====================================================

app.use((req, res, next) => {
  console.log(
    "REQUEST:",
    req.method,
    req.originalUrl,
  );

  res.setHeader(
    "Access-Control-Allow-Origin",
    "*",
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization",
  );

  // ===================================================
  // RESPONDER PREFLIGHT DEL NAVEGADOR
  // ===================================================

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  next();
});

// =====================================================
// PAQUETE CORS
// =====================================================

app.use(cors(corsOptions));

// =====================================================
// BODY PARSERS
// =====================================================

app.use(
  bodyParser.json({
    limit: "50mb",
  }),
);

app.use(
  bodyParser.urlencoded({
    extended: true,
    limit: "50mb",
  }),
);

// =====================================================
// TEST CORS
// =====================================================

app.get("/test-cors", (req, res) => {
  res.json({
    success: true,
    message: "CORS funcionando correctamente",
  });
});

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

console.log("====================================");
console.log("ALMACENAMIENTO DE ARCHIVOS");
console.log("Render:", !!process.env.RENDER);
console.log("uploadsDir:", uploadsDir);
console.log("====================================");

// Asegurar que exista la carpeta física del Disk
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Carpeta exclusiva para reportes NOM dentro del mismo Disk
const reportesNomDir = path.join(uploadsDir, "reportes_nom");

if (!fs.existsSync(reportesNomDir)) {
  fs.mkdirSync(reportesNomDir, { recursive: true });
}

// Servir públicamente TODO lo almacenado en el Disk de Render.
// Ruta física: /uploads/archivo.pdf
// URL pública: https://app-clientes-sr5h.onrender.com/uploads/archivo.pdf
app.use(
  "/uploads",
  express.static(uploadsDir, {
    setHeaders: (res, filePath) => {
      const ext = path.extname(filePath).toLowerCase();

      if (ext === ".pdf") {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "inline");
      }

      // Evita que el navegador conserve una respuesta 404 antigua
      // cuando un archivo acaba de ser reemplazado.
      res.setHeader("Cache-Control", "no-cache");
    },
  }),
);

// Diagnóstico del Disk
app.get("/debug-storage", (req, res) => {
  try {
    const existe = fs.existsSync(uploadsDir);
    const archivos = existe ? fs.readdirSync(uploadsDir) : [];

    res.json({
      success: true,
      render: !!process.env.RENDER,
      uploadsDir,
      existe,
      archivos,
      reportesNomDir,
      reportesNomExiste: fs.existsSync(reportesNomDir),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      uploadsDir,
      error: error.message,
    });
  }
});

// Diagnóstico de un archivo específico del directorio principal
app.get("/debug-file/:filename", (req, res) => {
  try {
    const nombre = path.basename(req.params.filename);
    const ruta = path.join(uploadsDir, nombre);
    const existe = fs.existsSync(ruta);

    res.json({
      success: true,
      nombre,
      ruta,
      existe,
      size: existe ? fs.statSync(ruta).size : 0,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ------------------- MULTER CORREGIDO -------------------
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    console.log("GUARDANDO ARCHIVO EN:", uploadsDir);
    cb(null, uploadsDir);
  },

  filename: function (req, file, cb) {
    let extension = path
      .extname(file.originalname || "")
      .toLowerCase();

    const esPdf =
      file.mimetype === "application/pdf" ||
      file.mimetype === "application/octet-stream" ||
      extension === ".pdf";

    if (esPdf) {
      extension = ".pdf";
    }

    if (!extension) {
      extension = "";
    }

    const nombre =
      `${Date.now()}-${Math.round(
        Math.random() * 1e9,
      )}${extension}`;

    console.log("ARCHIVO ORIGINAL:", file.originalname);
    console.log("ARCHIVO FÍSICO:", nombre);

    cb(null, nombre);
  },
});

const storageReportesNom = multer.diskStorage({
  destination: function (req, file, cb) {
    console.log(
      "GUARDANDO REPORTE NOM EN:",
      reportesNomDir,
    );

    cb(null, reportesNomDir);
  },

  filename: function (req, file, cb) {
    let extension = path
      .extname(file.originalname || "")
      .toLowerCase();

    const esPdf =
      file.mimetype === "application/pdf" ||
      file.mimetype === "application/octet-stream" ||
      extension === ".pdf";

    if (esPdf) {
      extension = ".pdf";
    }

    if (!extension) {
      extension = ".pdf";
    }

    const nombreArchivo =
      `${Date.now()}-${Math.round(
        Math.random() * 1e9,
      )}${extension}`;

    console.log(
      "ARCHIVO ORIGINAL REPORTE NOM:",
      file.originalname,
    );

    console.log(
      "NOMBRE FÍSICO REPORTE NOM:",
      nombreArchivo,
    );

    cb(null, nombreArchivo);
  },
});

const uploadReporteNom = multer({
  storage: storageReportesNom,

  fileFilter: (req, file, cb) => {
    console.log(
      "====================================",
    );

    console.log(
      "VALIDANDO REPORTE NOM",
    );

    console.log(
      "Nombre:",
      file.originalname,
    );

    console.log(
      "MIME:",
      file.mimetype,
    );

    console.log(
      "====================================",
    );

    const extension = path
      .extname(
        file.originalname || "",
      )
      .toLowerCase();

    const esPdf =
      file.mimetype ===
        "application/pdf" ||
      file.mimetype ===
        "application/octet-stream" ||
      extension === ".pdf";

    if (esPdf) {
      return cb(
        null,
        true,
      );
    }

    cb(
      new Error(
        "Solo se permiten archivos PDF",
      ),
      false,
    );
  },

  limits: {
    fileSize:
      50 * 1024 * 1024,
  },
});

// =====================================================
// SUBIR DOCUMENTOS DE REPORTES NOM
// OPCIONES 1 A 12
// =====================================================

// =====================================================
// SUBIR / REEMPLAZAR DOCUMENTOS DE REPORTES NOM
// OPCIONES 1 A 12
//
// GUARDA FÍSICAMENTE EN:
// /uploads/reportes_nom
//
// GUARDA EN BD UNA RUTA COMO:
// /uploads/reportes_nom/1788984000000-123456789.pdf
//
// SI YA EXISTE:
// cliente_id + opcion_nom + tipo_documento
// SE ACTUALIZA EN VEZ DE INSERTAR OTRO REGISTRO
// =====================================================

app.post(
  "/reportes-nom",
  uploadReporteNom.single("archivo"),
  async (req, res) => {
    try {
      console.log("=================================");
      console.log("===== SUBIDA REPORTE NOM =====");
      console.log("=================================");

      console.log("BODY:", req.body);
      console.log("FILE:", req.file);

      const {
        cliente_id,
        opcion_nom,
        tipo_documento,
      } = req.body;

      // =================================================
      // VALIDAR ARCHIVO
      // =================================================

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "No se recibió ningún archivo PDF",
        });
      }

      // =================================================
      // VALIDAR CLIENTE
      // =================================================

      if (!cliente_id) {
        // Eliminar archivo recién subido si faltan datos
        try {
          if (req.file?.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
        } catch (errorEliminar) {
          console.log(
            "No se pudo eliminar archivo temporal:",
            errorEliminar.message,
          );
        }

        return res.status(400).json({
          success: false,
          error: "cliente_id es requerido",
        });
      }

      // =================================================
      // VALIDAR OPCIÓN NOM
      // =================================================

      if (!opcion_nom) {
        try {
          if (req.file?.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
        } catch (errorEliminar) {
          console.log(
            "No se pudo eliminar archivo temporal:",
            errorEliminar.message,
          );
        }

        return res.status(400).json({
          success: false,
          error: "opcion_nom es requerido",
        });
      }

      // =================================================
      // VALIDAR TIPO DOCUMENTO
      // =================================================

      if (!tipo_documento) {
        try {
          if (req.file?.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
        } catch (errorEliminar) {
          console.log(
            "No se pudo eliminar archivo temporal:",
            errorEliminar.message,
          );
        }

        return res.status(400).json({
          success: false,
          error: "tipo_documento es requerido",
        });
      }

      // =================================================
      // NOMBRE ORIGINAL LIMPIO
      //
      // Ejemplo recibido:
      // Tabla%20I.1.pdf
      //
      // Queda:
      // Tabla I.1.pdf
      // =================================================

      let nombreOriginalLimpio =
        req.file.originalname || "documento.pdf";

      try {
        nombreOriginalLimpio =
          decodeURIComponent(nombreOriginalLimpio);
      } catch (errorDecode) {
        console.log(
          "No fue necesario decodificar el nombre:",
          nombreOriginalLimpio,
        );
      }

      // =================================================
      // RUTA PÚBLICA A GUARDAR EN POSTGRESQL
      //
      // IMPORTANTE:
      // físicamente el archivo está en:
      // /uploads/reportes_nom/archivo.pdf
      //
      // y esa misma ruta pública funciona con Express:
      // https://app-clientes-sr5h.onrender.com/uploads/reportes_nom/archivo.pdf
      // =================================================

      const ruta =
        `/uploads/reportes_nom/${req.file.filename}`;

      console.log("=================================");
      console.log("DATOS DEL ARCHIVO");
      console.log("Nombre físico:", req.file.filename);
      console.log("Nombre original:", nombreOriginalLimpio);
      console.log("Ruta física:", req.file.path);
      console.log("Ruta BD:", ruta);
      console.log("Cliente:", cliente_id);
      console.log("Opción NOM:", opcion_nom);
      console.log("Tipo documento:", tipo_documento);
      console.log("=================================");

      // =================================================
      // VERIFICAR QUE EL CLIENTE EXISTA
      // =================================================

      const clienteExiste = await db.query(
        `
        SELECT id
        FROM clientes
        WHERE id = $1
        `,
        [cliente_id],
      );

      if (clienteExiste.rows.length === 0) {
        try {
          if (req.file?.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
        } catch (errorEliminar) {
          console.log(
            "No se pudo eliminar archivo nuevo:",
            errorEliminar.message,
          );
        }

        return res.status(404).json({
          success: false,
          error: "El cliente indicado no existe",
        });
      }

      // =================================================
      // BUSCAR SI YA EXISTE ESA COMBINACIÓN
      //
      // Esto coincide con tu constraint:
      // unique_reporte_nom_documento
      // =================================================

      const existente = await db.query(
        `
        SELECT
          id,
          nombre_archivo,
          archivo
        FROM reportes_nom
        WHERE cliente_id = $1
          AND opcion_nom = $2
          AND tipo_documento = $3
        LIMIT 1
        `,
        [
          cliente_id,
          opcion_nom,
          tipo_documento,
        ],
      );

      // =================================================
      // SI YA EXISTE -> ACTUALIZAR
      // =================================================

      if (existente.rows.length > 0) {
        const anterior =
          existente.rows[0];

        const result = await db.query(
          `
          UPDATE reportes_nom

          SET
            nombre_archivo = $1,
            archivo = $2,
            created_at = CURRENT_TIMESTAMP

          WHERE id = $3

          RETURNING *
          `,
          [
            nombreOriginalLimpio,
            ruta,
            anterior.id,
          ],
        );

        // =================================================
        // ELIMINAR PDF ANTERIOR DEL DISK
        //
        // SOLO DESPUÉS DE QUE EL UPDATE FUE CORRECTO
        // =================================================

        try {
          if (
            anterior.archivo &&
            anterior.archivo.startsWith(
              "/uploads/reportes_nom/",
            )
          ) {
            const nombreAnterior =
              path.basename(
                anterior.archivo,
              );

            const rutaAnterior =
              path.join(
                reportesNomDir,
                nombreAnterior,
              );

            // Evitar borrar el mismo archivo nuevo
            if (
              rutaAnterior !==
                req.file.path &&
              fs.existsSync(rutaAnterior)
            ) {
              fs.unlinkSync(rutaAnterior);

              console.log(
                "PDF anterior eliminado del Disk:",
                rutaAnterior,
              );
            }
          }
        } catch (errorEliminar) {
          console.log(
            "No fue posible eliminar el PDF anterior:",
            errorEliminar.message,
          );
        }

        console.log(
          "=================================",
        );
        console.log(
          "REPORTE NOM ACTUALIZADO",
        );
        console.log(
          result.rows[0],
        );
        console.log(
          "=================================",
        );

        return res.json({
          success: true,
          mensaje:
            "PDF actualizado correctamente",
          actualizado: true,
          reporte:
            result.rows[0],
        });
      }

      // =================================================
      // SI NO EXISTE -> INSERTAR
      // =================================================

      const result = await db.query(
        `
        INSERT INTO reportes_nom
        (
          cliente_id,
          opcion_nom,
          tipo_documento,
          nombre_archivo,
          archivo
        )
        VALUES
        (
          $1,
          $2,
          $3,
          $4,
          $5
        )
        RETURNING *
        `,
        [
          cliente_id,
          opcion_nom,
          tipo_documento,
          nombreOriginalLimpio,
          ruta,
        ],
      );

      console.log(
        "=================================",
      );
      console.log(
        "NUEVO REPORTE NOM GUARDADO",
      );
      console.log(
        result.rows[0],
      );
      console.log(
        "=================================",
      );

      res.json({
        success: true,
        mensaje:
          "PDF subido correctamente",
        actualizado: false,
        reporte:
          result.rows[0],
      });

    } catch (error) {
      console.error(
        "=================================",
      );

      console.error(
        "❌ ERROR SUBIENDO REPORTE NOM:",
        error,
      );

      console.error(
        "=================================",
      );

      // =================================================
      // SI FALLÓ POSTGRESQL
      // ELIMINAR PDF NUEVO PARA NO DEJAR BASURA EN EL DISK
      // =================================================

      try {
        if (
          req.file?.path &&
          fs.existsSync(req.file.path)
        ) {
          fs.unlinkSync(
            req.file.path,
          );

          console.log(
            "PDF nuevo eliminado por error:",
            req.file.path,
          );
        }
      } catch (errorEliminar) {
        console.log(
          "No se pudo eliminar PDF fallido:",
          errorEliminar.message,
        );
      }

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
);

app.get("/test-uploads", (req, res) => {
  fs.readdir(uploadsDir, (err, files) => {
    if (err) {
      return res.status(500).json(err);
    }

    res.json(files);
  });
});

const fileFilter = (req, file, cb) => {
  const extension = path.extname(file.originalname || "").toLowerCase();

  const esPdf =
    file.mimetype === "application/pdf" ||
    file.mimetype === "application/octet-stream" ||
    extension === ".pdf";

  const esImagen =
    file.mimetype === "image/jpeg" ||
    file.mimetype === "image/jpg" ||
    file.mimetype === "image/png" ||
    extension === ".jpg" ||
    extension === ".jpeg" ||
    extension === ".png";

  console.log("VALIDANDO ARCHIVO:", {
    originalname: file.originalname,
    mimetype: file.mimetype,
    extension,
    esPdf,
    esImagen,
  });

  if (esPdf || esImagen) {
    return cb(null, true);
  }

  cb(new Error("Tipo de archivo no permitido"), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
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

// =====================================================
// OBTENER CLIENTES
// ADMIN ID = 1 VE TODOS
// LOS DEMÁS USUARIOS SOLO VEN LOS SUYOS
// =====================================================

app.get("/clientes/:usuarioId", async (req, res) => {
  try {
    const usuarioId = parseInt(req.params.usuarioId, 10);

    console.log("====================================");
    console.log("CONSULTANDO CLIENTES");
    console.log("USUARIO ID:", usuarioId);
    console.log("====================================");

    let result;

    // =================================================
    // ADMINISTRADOR
    // ID = 1
    // =================================================

    if (usuarioId === 1) {
      console.log("MODO ADMINISTRADOR - MOSTRANDO TODOS LOS CLIENTES");

      result = await db.query(`
        SELECT
          c.*,
          u.usuario AS usuario_registro
        FROM clientes c

        LEFT JOIN usuarios u
          ON u.id = c.usuario_id

        ORDER BY c.id DESC
      `);
    }

    // =================================================
    // USUARIO NORMAL
    // SOLO SUS CLIENTES
    // =================================================

    else {
      console.log(
        "USUARIO NORMAL - MOSTRANDO SOLO SUS CLIENTES",
      );

      result = await db.query(
        `
        SELECT
          c.*,
          u.usuario AS usuario_registro
        FROM clientes c

        LEFT JOIN usuarios u
          ON u.id = c.usuario_id

        WHERE c.usuario_id = $1

        ORDER BY c.id DESC
        `,
        [usuarioId],
      );
    }

    console.log(
      "CLIENTES ENCONTRADOS:",
      result.rows.length,
    );

    res.json(result.rows);
  } catch (error) {
    console.error(
      "ERROR OBTENIENDO CLIENTES:",
      error,
    );

    res.status(500).json({
      error: "Error al obtener clientes",
    });
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
    const result = await db.query(`
      SELECT
        r.id,
        r.nombre,
        r.categoria_id,
        c.nombre AS categoria
      FROM riesgos_laborales r
      INNER JOIN categorias_epp c
        ON r.categoria_id = c.id
      ORDER BY c.nombre, r.nombre
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err.message,
    });
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

// =====================================================
// SUBIR DOCUMENTOS ARP / FICHA
//
// SOPORTA:
// 1. documentos antiguos ligados al cuestionario
// 2. documentos nuevos ligados directamente al puesto
// =====================================================

app.post("/documentos", upload.single("archivo"), async (req, res) => {
  console.log("====================================");
  console.log("SUBIENDO DOCUMENTO");
  console.log("BODY:", req.body);
  console.log("FILE:", req.file);
  console.log("====================================");

  try {
    const {
      cuestionario_info_id,
      puesto_id,
      tipo,
    } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No se recibió archivo",
      });
    }

    if (!tipo) {
      return res.status(400).json({
        success: false,
        error: "El tipo de documento es requerido",
      });
    }

    if (!["ARP", "FICHA"].includes(tipo)) {
      return res.status(400).json({
        success: false,
        error: "El tipo debe ser ARP o FICHA",
      });
    }

    // Debe venir por lo menos uno de los dos
    if (!cuestionario_info_id && !puesto_id) {
      return res.status(400).json({
        success: false,
        error:
          "Se requiere cuestionario_info_id o puesto_id",
      });
    }

    const ruta =
      `/uploads/${req.file.filename}`;

    console.log("Ruta BD:", ruta);

    // =================================================
    // NUEVA FORMA:
    // DOCUMENTO DIRECTAMENTE DEL PUESTO
    // =================================================

    if (puesto_id) {
      const puestoExiste = await db.query(
        `
        SELECT id
        FROM puestos_trabajo
        WHERE id = $1
        `,
        [puesto_id],
      );

      if (puestoExiste.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "El puesto indicado no existe",
        });
      }

      // -------------------------------------------------
      // Buscar si ya existe documento de ese tipo
      // para el mismo puesto
      // -------------------------------------------------

      const existente = await db.query(
        `
        SELECT id, archivo
        FROM documentos_cuestionario
        WHERE puesto_id = $1
          AND tipo = $2
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [puesto_id, tipo],
      );

      let result;

      // -------------------------------------------------
      // SI EXISTE → ACTUALIZAR
      // -------------------------------------------------

      if (existente.rows.length > 0) {
        const archivoAnterior = existente.rows[0].archivo;

        result = await db.query(
          `
          UPDATE documentos_cuestionario
          SET
            archivo = $1,
            created_at = CURRENT_TIMESTAMP
          WHERE id = $2
          RETURNING *
          `,
          [ruta, existente.rows[0].id],
        );

        // Eliminar el archivo físico anterior solamente después de actualizar BD.
        // Así evitamos acumular PDFs reemplazados en el Disk.
        if (archivoAnterior && archivoAnterior.startsWith("/uploads/")) {
          const nombreAnterior = path.basename(archivoAnterior);
          const rutaAnterior = path.join(uploadsDir, nombreAnterior);

          if (fs.existsSync(rutaAnterior) && rutaAnterior !== req.file.path) {
            try {
              fs.unlinkSync(rutaAnterior);
              console.log("ARCHIVO ANTERIOR ELIMINADO:", rutaAnterior);
            } catch (unlinkError) {
              console.warn(
                "No se pudo eliminar el archivo anterior:",
                unlinkError.message,
              );
            }
          }
        }
      }

      // -------------------------------------------------
      // SI NO EXISTE → INSERTAR
      // -------------------------------------------------

      else {
        result = await db.query(
          `
          INSERT INTO documentos_cuestionario
          (
            cuestionario_info_id,
            puesto_id,
            tipo,
            archivo
          )
          VALUES
          (
            NULL,
            $1,
            $2,
            $3
          )
          RETURNING *
          `,
          [
            puesto_id,
            tipo,
            ruta,
          ],
        );
      }

      return res.json({
        success: true,
        message:
          tipo === "ARP"
            ? "ARP guardado correctamente"
            : "Ficha de Proceso guardada correctamente",
        documento: result.rows[0],
      });
    }

    // =================================================
    // FORMA ANTIGUA:
    // DOCUMENTO LIGADO AL CUESTIONARIO
    // =================================================

    const result = await db.query(
      `
      INSERT INTO documentos_cuestionario
      (
        cuestionario_info_id,
        puesto_id,
        tipo,
        archivo
      )
      VALUES
      (
        $1,
        NULL,
        $2,
        $3
      )
      RETURNING *
      `,
      [
        cuestionario_info_id,
        tipo,
        ruta,
      ],
    );

    res.json({
      success: true,
      documento: result.rows[0],
    });
  } catch (error) {
    console.error(
      "ERROR SUBIENDO DOCUMENTO:",
      error,
    );

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get(
  "/documentos-puesto/:puestoId",
  async (req, res) => {
    try {
      const result = await db.query(
        `
        SELECT
          id,
          cuestionario_info_id,
          puesto_id,
          tipo,
          archivo,
          created_at

        FROM documentos_cuestionario

        WHERE puesto_id = $1
          AND tipo IN ('ARP', 'FICHA')

        ORDER BY created_at DESC
        `,
        [req.params.puestoId],
      );

      res.json(result.rows);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "No fue posible obtener los documentos del puesto.",
      });
    }
  },
);

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
// REPORTE CONSOLIDADO NOM
// Cliente + Área + Puesto
// + ARP
// + Ficha Técnica NOM
// + Ficha Técnica EPP
// + Certificado EPP
// ===============================
// ===============================
// REPORTE CONSOLIDADO NOM
// Cliente + Área + Puesto
// + ARP
// + Ficha Técnica NOM
// + Ficha Técnica EPP
// + Certificado EPP
//
// COMPATIBLE CON:
// - documentos antiguos ligados a cuestionario_info_id
// - documentos nuevos ligados directamente a puesto_id
// ===============================

app.get("/reporte-consolidado", async (req, res) => {
  try {
    const puestoId = parseInt(req.query.puestoId, 10);

    if (!puestoId) {
      return res.status(400).json({
        message: "puestoId requerido",
      });
    }

    const sql = `
      SELECT

        /* =====================================
           CLIENTE
        ===================================== */

        c.id AS cliente_id,
        c.nombre_empresa AS cliente_nombre,


        /* =====================================
           ÁREA
        ===================================== */

        a.id AS area_id,
        a.nombre_area AS area_nombre,


        /* =====================================
           PUESTO
        ===================================== */

        p.id AS puesto_id,
        p.puesto AS puesto_nombre,


        /* =====================================
           CUESTIONARIO
        ===================================== */

        ci.id AS info_id,
        ci.nom,
        ci.created_at,
        ci.image,


        /* =====================================
           ARP
           
           PRIORIDAD:
           1. Documento nuevo ligado al puesto
           2. Documento antiguo ligado al cuestionario
        ===================================== */

        COALESCE(
          (
            SELECT dc_nuevo.archivo

            FROM documentos_cuestionario dc_nuevo

            WHERE dc_nuevo.puesto_id = p.id
              AND dc_nuevo.tipo = 'ARP'

            ORDER BY dc_nuevo.created_at DESC

            LIMIT 1
          ),

          (
            SELECT dc_antiguo.archivo

            FROM documentos_cuestionario dc_antiguo

            WHERE dc_antiguo.cuestionario_info_id = ci.id
              AND dc_antiguo.tipo = 'ARP'

            ORDER BY dc_antiguo.created_at DESC

            LIMIT 1
          )
        ) AS arp,


        /* =====================================
           FICHA DE PROCESO
           
           PRIORIDAD:
           1. Documento nuevo ligado al puesto
           2. Documento antiguo ligado al cuestionario
        ===================================== */

        COALESCE(
          (
            SELECT dc_nuevo.archivo

            FROM documentos_cuestionario dc_nuevo

            WHERE dc_nuevo.puesto_id = p.id
              AND dc_nuevo.tipo = 'FICHA'

            ORDER BY dc_nuevo.created_at DESC

            LIMIT 1
          ),

          (
            SELECT dc_antiguo.archivo

            FROM documentos_cuestionario dc_antiguo

            WHERE dc_antiguo.cuestionario_info_id = ci.id
              AND dc_antiguo.tipo = 'FICHA'

            ORDER BY dc_antiguo.created_at DESC

            LIMIT 1
          )
        ) AS ficha,


        /* =====================================
           DOCUMENTOS DEL EPP / INVENTARIO
        ===================================== */

        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', inv.id,
                'nombre_producto', inv.nombre_producto,
                'clave_producto', inv.clave_producto,
                'marca', inv.marca,
                'ficha_tecnica', inv.ficha_tecnica,
                'certificado', inv.certificado
              )
              ORDER BY inv.id
            )

            FROM inventario inv

            WHERE inv.puesto_id = p.id
          ),

          '[]'::json
        ) AS documentos_epp,


        /* =====================================
           INFORMACIÓN DEL CUESTIONARIO
        ===================================== */

        ci.observaciones AS naturaleza_emision,

        ci.recomendaciones AS descripcion_operacion,

        ci.recomendaciones_epp AS epp_recomendado,


        /* =====================================
           SUBOPCIÓN
        ===================================== */

        ns.subopcion,


        /* =====================================
           PREGUNTA / RESPUESTA
        ===================================== */

        q.pregunta,
        q.respuesta


      FROM puestos_trabajo p


      /* =====================================
         ÁREA
      ===================================== */

      INNER JOIN areas_trabajo a
        ON a.id = p.area_id


      /* =====================================
         CLIENTE
      ===================================== */

      INNER JOIN clientes c
        ON c.id = a.cliente_id


      /* =====================================
         CUESTIONARIOS
      ===================================== */

      INNER JOIN cuestionarios_info ci
        ON ci.puesto_id = p.id


      /* =====================================
         RESPUESTAS
      ===================================== */

      INNER JOIN cuestionarios q
        ON q.info_id = ci.id


      /* =====================================
         SUBOPCIÓN
      ===================================== */

      LEFT JOIN nom_subopciones ns
        ON ns.id = ci.subopcion_id


      /* =====================================
         FILTRO DEL PUESTO
      ===================================== */

      WHERE p.id = $1


      /* =====================================
         ORDEN
      ===================================== */

      ORDER BY
        ci.created_at,
        q.id;
    `;

    const { rows } = await db.query(
      sql,
      [puestoId],
    );

    console.log(
      "====================================",
    );

    console.log(
      "REPORTE CONSOLIDADO",
    );

    console.log(
      "PUESTO:",
      puestoId,
    );

    console.log(
      "REGISTROS:",
      rows.length,
    );

    console.log(
      "====================================",
    );

    res.json(rows);

  } catch (error) {

    console.error(
      "❌ Error reporte consolidado:",
      error,
    );

    res.status(500).json({
      message:
        "Error interno en reporte consolidado",

      error:
        error.message,
    });
  }
});

// ======================================================
// ELIMINAR CLIENTE COMPLETO
//
// ELIMINA:
// - inventario
// - reportes NOM
// - documentos ARP / FICHA nuevos
// - documentos ARP / FICHA antiguos
// - cuestionarios
// - cuestionarios_info
// - puestos_riesgos
// - puestos_epp
// - puestos_normas
// - puestos
// - áreas
// - cliente
// ======================================================

app.delete("/clientes/:id", async (req, res) => {

  const clienteId =
    parseInt(
      req.params.id,
      10,
    );


  if (!clienteId) {

    return res.status(400).json({
      success: false,
      message:
        "ID de cliente inválido",
    });
  }


  const client =
    await db.connect();


  try {

    console.log(
      "====================================",
    );

    console.log(
      "ELIMINANDO CLIENTE COMPLETO",
    );

    console.log(
      "CLIENTE ID:",
      clienteId,
    );

    console.log(
      "====================================",
    );


    await client.query(
      "BEGIN",
    );


    // ==================================================
    // 1. VERIFICAR QUE EL CLIENTE EXISTA
    // ==================================================

    const clienteExiste =
      await client.query(
        `
        SELECT id
        FROM clientes
        WHERE id = $1
        `,
        [
          clienteId,
        ],
      );


    if (
      clienteExiste.rows.length === 0
    ) {

      await client.query(
        "ROLLBACK",
      );


      return res.status(404).json({
        success: false,
        message:
          "El cliente no existe",
      });
    }


    // ==================================================
    // 2. ELIMINAR INVENTARIO
    // ==================================================

    await client.query(
      `
      DELETE FROM inventario
      WHERE cliente_id = $1
      `,
      [
        clienteId,
      ],
    );


    // ==================================================
    // 3. ELIMINAR REPORTES NOM DEL CLIENTE
    // ==================================================

    await client.query(
      `
      DELETE FROM reportes_nom
      WHERE cliente_id = $1
      `,
      [
        clienteId,
      ],
    );


    // ==================================================
    // 4. OBTENER ÁREAS DEL CLIENTE
    // ==================================================

    const areas =
      await client.query(
        `
        SELECT id
        FROM areas_trabajo
        WHERE cliente_id = $1
        `,
        [
          clienteId,
        ],
      );


    // ==================================================
    // RECORRER ÁREAS
    // ==================================================

    for (
      const area
      of areas.rows
    ) {

      // ================================================
      // 5. OBTENER PUESTOS
      // ================================================

      const puestos =
        await client.query(
          `
          SELECT id
          FROM puestos_trabajo
          WHERE area_id = $1
          `,
          [
            area.id,
          ],
        );


      // ================================================
      // RECORRER PUESTOS
      // ================================================

      for (
        const puesto
        of puestos.rows
      ) {


        // ==============================================
        // 6. DOCUMENTOS NUEVOS
        // LIGADOS DIRECTAMENTE AL PUESTO
        // ==============================================

        await client.query(
          `
          DELETE FROM documentos_cuestionario
          WHERE puesto_id = $1
          `,
          [
            puesto.id,
          ],
        );


        // ==============================================
        // 7. RELACIONES DE RIESGOS
        // ==============================================

        await client.query(
          `
          DELETE FROM puestos_riesgos
          WHERE puesto_id = $1
          `,
          [
            puesto.id,
          ],
        );


        // ==============================================
        // 8. RELACIONES DE EPP
        // ==============================================

        await client.query(
          `
          DELETE FROM puestos_epp
          WHERE puesto_id = $1
          `,
          [
            puesto.id,
          ],
        );


        // ==============================================
        // 9. RELACIONES DE NORMAS
        // ==============================================

        await client.query(
          `
          DELETE FROM puestos_normas
          WHERE puesto_id = $1
          `,
          [
            puesto.id,
          ],
        );


        // ==============================================
        // 10. OBTENER cuestionarios_info
        // ==============================================

        const infos =
          await client.query(
            `
            SELECT id
            FROM cuestionarios_info
            WHERE puesto_id = $1
            `,
            [
              puesto.id,
            ],
          );


        // ==============================================
        // RECORRER INFORMACIÓN DE CUESTIONARIOS
        // ==============================================

        for (
          const info
          of infos.rows
        ) {


          // ============================================
          // 11. ELIMINAR RESPUESTAS
          // ============================================

          await client.query(
            `
            DELETE FROM cuestionarios
            WHERE info_id = $1
            `,
            [
              info.id,
            ],
          );


          // ============================================
          // 12. DOCUMENTOS ANTIGUOS
          // LIGADOS A cuestionario_info_id
          // ============================================

          await client.query(
            `
            DELETE FROM documentos_cuestionario
            WHERE cuestionario_info_id = $1
            `,
            [
              info.id,
            ],
          );
        }


        // ==============================================
        // 13. ELIMINAR cuestionarios_info
        // ==============================================

        await client.query(
          `
          DELETE FROM cuestionarios_info
          WHERE puesto_id = $1
          `,
          [
            puesto.id,
          ],
        );


        // ==============================================
        // 14. ELIMINAR PUESTO
        // ==============================================

        await client.query(
          `
          DELETE FROM puestos_trabajo
          WHERE id = $1
          `,
          [
            puesto.id,
          ],
        );
      }


      // =================================================
      // 15. ELIMINAR ÁREA
      // =================================================

      await client.query(
        `
        DELETE FROM areas_trabajo
        WHERE id = $1
        `,
        [
          area.id,
        ],
      );
    }


    // ==================================================
    // 16. ELIMINAR CLIENTE
    // ==================================================

    await client.query(
      `
      DELETE FROM clientes
      WHERE id = $1
      `,
      [
        clienteId,
      ],
    );


    // ==================================================
    // 17. CONFIRMAR TRANSACCIÓN
    // ==================================================

    await client.query(
      "COMMIT",
    );


    console.log(
      "====================================",
    );

    console.log(
      "CLIENTE ELIMINADO CORRECTAMENTE",
    );

    console.log(
      "CLIENTE ID:",
      clienteId,
    );

    console.log(
      "====================================",
    );


    res.json({
      success: true,
      message:
        "Cliente eliminado correctamente",
    });

  } catch (error) {

    // ==================================================
    // ERROR → DESHACER TODO
    // ==================================================

    await client.query(
      "ROLLBACK",
    );


    console.error(
      "====================================",
    );

    console.error(
      "ERROR ELIMINANDO CLIENTE:",
      error,
    );

    console.error(
      "====================================",
    );


    res.status(500).json({

      success: false,

      message:
        error.message,

      detail:
        error.detail,

      table:
        error.table,

      constraint:
        error.constraint,
    });

  } finally {

    client.release();
  }
});

//Crear inventario

app.post(
  "/inventario",
  upload.fields([
    { name: "ficha_tecnica", maxCount: 1 },
    { name: "certificado", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      console.log("=================================");
console.log("📦 BODY INVENTARIO:");
console.log(req.body);

console.log("📄 FILES INVENTARIO:");
console.log(req.files);

console.log("=================================");
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

      // ===========================
      // Obtener rutas de los PDF
      // ===========================

      const fichaTecnica = req.files?.ficha_tecnica
        ? `/uploads/${req.files.ficha_tecnica[0].filename}`
        : null;

      const certificado = req.files?.certificado
        ? `/uploads/${req.files.certificado[0].filename}`
        : null;

      console.log("Ficha técnica:", fichaTecnica);
      console.log("Certificado:", certificado);

      const result = await db.query(
        `
        INSERT INTO inventario
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
          puesto_id,
          ficha_tecnica,
          certificado
        )
        VALUES
        (
          $1,$2,$3,$4,$5,$6,$7,$8,
          $9,$10,$11,$12,$13,$14
        )
        RETURNING *
        `,
        [
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
          puesto_id,
          fichaTecnica,
          certificado,
        ],
      );

      res.json(result.rows[0]);
    } catch (error) {
      console.log(error);

      res.status(500).json({
        error: error.message,
      });
    }
  },
);

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

app.post("/validar-password", async(req,res)=>{

 try{

 const {usuario_id,password}=req.body;


 const usuario = await db.query(
 `
 SELECT password
 FROM usuarios
 WHERE id=$1
 `,
 [usuario_id]
 );


 if(usuario.rows.length===0){

   return res.json({
    valido:false
   });

 }


 if(usuario.rows[0].password === password){

   return res.json({
    valido:true
   });

 }


 res.json({
   valido:false
 });


 }catch(error){

 console.log(error);

 res.status(500).json({
  error:error.message
 });

 }

});

app.get("/reportes/puestos/:clienteId", async (req, res) => {

  const { clienteId } = req.params;

  try {

    const resultado = await db.query(
      `
      SELECT 
        p.id,
        p.puesto,
        p.numero_usuarios,
        p.descripcion,
        p.criterio_epp,

        a.nombre_area,

        COALESCE(
          json_agg(DISTINCT r.nombre)
          FILTER (WHERE r.nombre IS NOT NULL),
          '[]'
        ) AS riesgos,

        COALESCE(
          json_agg(DISTINCT e.nombre)
          FILTER (WHERE e.nombre IS NOT NULL),
          '[]'
        ) AS epp


      FROM puestos_trabajo p

      INNER JOIN areas_trabajo a
      ON p.area_id = a.id


      LEFT JOIN puestos_riesgos pr
      ON p.id = pr.puesto_id


      LEFT JOIN riesgos_laborales r
      ON pr.riesgo_id = r.id


      LEFT JOIN puestos_epp pe
      ON p.id = pe.puesto_id


      LEFT JOIN equipo_proteccion e
      ON pe.epp_id = e.id


      WHERE a.cliente_id = $1


      GROUP BY 
        p.id,
        a.nombre_area


      ORDER BY 
        a.nombre_area,
        p.puesto

      `,
      [clienteId]
    );


    res.json(resultado.rows);


  } catch(error){

    console.log("ERROR REPORTES PUESTOS:", error.message);

    res.status(500).json({
      error:error.message
    });

  }

});

app.get("/reportes/areas/:clienteId", async (req, res) => {

  const { clienteId } = req.params;

  try {

    const resultado = await db.query(
      `
      SELECT
        a.id,
        a.nombre_area,
        a.descripcion,
        a.image,
        a.encargado,
        a.contacto

      FROM areas_trabajo a

      WHERE a.cliente_id = $1

      ORDER BY a.nombre_area

      `,
      [clienteId]
    );


    res.json(resultado.rows);


  } catch(error){

    console.log(error);

    res.status(500).json({
      error:"Error obteniendo áreas del cliente"
    });

  }

});

// =====================================================
// OBTENER REPORTES NOM DE UN CLIENTE
// =====================================================

app.get("/reportes-nom/:clienteId", async (req, res) => {
  const { clienteId } = req.params;

  try {
    const resultado = await db.query(
      `
      SELECT
        id,
        cliente_id,
        opcion_nom,
        tipo_documento,
        nombre_archivo,
        archivo,
        created_at
      FROM reportes_nom
      WHERE cliente_id = $1
      ORDER BY opcion_nom ASC, id ASC
      `,
      [clienteId]
    );

    res.json(resultado.rows);
  } catch (error) {
    console.error("ERROR OBTENIENDO REPORTES NOM:", error);

    res.status(500).json({
      error: "No se pudieron obtener los reportes NOM",
    });
  }
});

// ======================================================
// OBTENER DOCUMENTOS ARP Y FICHA DE NOM POR CLIENTE
// ======================================================

// ======================================================
// OBTENER DOCUMENTOS ARP Y FICHA POR CLIENTE
//
// COMPATIBLE CON:
// 1. Documentos nuevos ligados directamente al puesto
// 2. Documentos antiguos ligados al cuestionario
// ======================================================

app.get(
  "/documentos-nom-cliente/:clienteId",
  async (req, res) => {

    try {

      const {
        clienteId,
      } = req.params;


      console.log(
        "====================================",
      );

      console.log(
        "CONSULTANDO DOCUMENTOS ARP / FICHA",
      );

      console.log(
        "CLIENTE:",
        clienteId,
      );

      console.log(
        "====================================",
      );


      const result = await db.query(
        `
        SELECT

          /* =====================================
             DOCUMENTO
          ===================================== */

          dc.id,

          dc.cuestionario_info_id,

          dc.puesto_id AS documento_puesto_id,

          dc.tipo,

          dc.archivo,

          dc.created_at,


          /* =====================================
             INFORMACIÓN NOM
             PUEDE SER NULL EN DOCUMENTOS NUEVOS
          ===================================== */

          ci.nom,

          ci.subopcion_id,


          /* =====================================
             PUESTO REAL

             NUEVO:
             dc.puesto_id

             ANTIGUO:
             ci.puesto_id
          ===================================== */

          COALESCE(
            dc.puesto_id,
            ci.puesto_id
          ) AS puesto_id,


          /* =====================================
             PUESTO
          ===================================== */

          pt.puesto AS puesto_nombre,


          /* =====================================
             ÁREA
          ===================================== */

          at.id AS area_id,

          at.nombre_area,


          /* =====================================
             CLIENTE
          ===================================== */

          c.id AS cliente_id,

          c.nombre_empresa AS cliente_nombre,


          /* =====================================
             ORIGEN DEL DOCUMENTO
          ===================================== */

          CASE

            WHEN dc.puesto_id IS NOT NULL
              THEN 'PUESTO'

            WHEN dc.cuestionario_info_id IS NOT NULL
              THEN 'CUESTIONARIO'

            ELSE 'DESCONOCIDO'

          END AS origen


        FROM documentos_cuestionario dc


        /* =====================================
           CUESTIONARIO

           LEFT JOIN PORQUE LOS NUEVOS
           DOCUMENTOS NO TIENEN cuestionario_info_id
        ===================================== */

        LEFT JOIN cuestionarios_info ci
          ON ci.id = dc.cuestionario_info_id


        /* =====================================
           PUESTO

           BUSCAR POR:
           - puesto_id directo
           - o puesto_id del cuestionario
        ===================================== */

        INNER JOIN puestos_trabajo pt
          ON pt.id = COALESCE(
            dc.puesto_id,
            ci.puesto_id
          )


        /* =====================================
           ÁREA
        ===================================== */

        INNER JOIN areas_trabajo at
          ON at.id = pt.area_id


        /* =====================================
           CLIENTE
        ===================================== */

        INNER JOIN clientes c
          ON c.id = at.cliente_id


        /* =====================================
           FILTRO
        ===================================== */

        WHERE c.id = $1

          AND dc.tipo IN (
            'ARP',
            'FICHA'
          )


        /* =====================================
           ORDEN

           PRIMERO DOCUMENTOS NUEVOS
           Y MÁS RECIENTES
        ===================================== */

        ORDER BY
          dc.created_at DESC,
          dc.id DESC
        `,

        [
          clienteId,
        ],
      );


      console.log(
        "DOCUMENTOS ARP/FICHA ENCONTRADOS:",
        result.rows.length,
      );


      res.json(
        result.rows,
      );

    } catch (error) {

      console.error(
        "ERROR OBTENIENDO ARP/FICHA:",
        error,
      );


      res.status(500).json({
        error:
          "No fue posible obtener los documentos ARP y FICHA.",
      });
    }
  },
);

// ======================================================
// OBTENER TODAS LAS FICHAS TÉCNICAS Y CERTIFICADOS EPP
// DE UN CLIENTE
// ======================================================

app.get("/documentos-epp-cliente/:clienteId", async (req, res) => {
  try {
    const { clienteId } = req.params;

    console.log("====================================");
    console.log("CONSULTANDO DOCUMENTOS EPP");
    console.log("CLIENTE:", clienteId);
    console.log("====================================");

    const result = await db.query(
      `
      SELECT
        i.id,
        i.cliente_id,
        i.area_id,
        i.puesto_id,

        i.clave_producto,
        i.nombre_producto,
        i.marca,
        i.descripcion,

        i.ficha_tecnica,
        i.certificado,

        a.nombre_area,
        p.puesto AS puesto_nombre

      FROM inventario i

      LEFT JOIN areas_trabajo a
        ON a.id = i.area_id

      LEFT JOIN puestos_trabajo p
        ON p.id = i.puesto_id

      WHERE i.cliente_id = $1
        AND i.tipo_producto = 'EPP'
        AND (
          i.ficha_tecnica IS NOT NULL
          OR i.certificado IS NOT NULL
        )

      ORDER BY
        a.nombre_area,
        p.puesto,
        i.nombre_producto,
        i.id DESC
      `,
      [clienteId],
    );

    console.log(
      "DOCUMENTOS EPP ENCONTRADOS:",
      result.rows.length,
    );

    res.json(result.rows);
  } catch (error) {
    console.error(
      "ERROR OBTENIENDO DOCUMENTOS EPP:",
      error,
    );

    res.status(500).json({
      error:
        "No fue posible obtener las fichas técnicas y certificados del EPP.",
    });
  }
});

// ======================================================
// MANEJO GLOBAL DE ERRORES DE MULTER / UPLOADS
// ======================================================
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    console.error("MULTER ERROR:", error);

    return res.status(400).json({
      success: false,
      error:
        error.code === "LIMIT_FILE_SIZE"
          ? "El archivo supera el límite de 50 MB"
          : error.message,
    });
  }

  if (error) {
    console.error("ERROR GLOBAL:", error);

    return res.status(400).json({
      success: false,
      error: error.message || "Error procesando la solicitud",
    });
  }

  next();
});

// =====================================================
// HISTÓRICO DE REGISTROS EPP
//
// COMPARACIÓN GLOBAL:
//
// - TODAS LAS ÁREAS
// - TODOS LOS PUESTOS
//
// RESULTADO:
//
// 1. EPP IDÉNTICOS
// 2. EPP DIFERENTES
// =====================================================

const construirSnapshotEpp = async (clienteId) => {
  // ===================================================
  // 1. CLIENTE
  // ===================================================

  const clienteResult = await db.query(
    `
    SELECT
      id,
      nombre_empresa
    FROM clientes
    WHERE id = $1
    `,
    [clienteId],
  );

  if (clienteResult.rows.length === 0) {
    throw new Error(
      "El cliente indicado no existe",
    );
  }

  const cliente =
    clienteResult.rows[0];

  // ===================================================
  // 2. ÁREAS
  // ===================================================

  const areasResult = await db.query(
    `
    SELECT
      id,
      nombre_area,
      descripcion
    FROM areas_trabajo
    WHERE cliente_id = $1
    ORDER BY nombre_area
    `,
    [clienteId],
  );

  // ===================================================
  // 3. PUESTOS
  // ===================================================

  const puestosResult = await db.query(
    `
    SELECT
      p.id,
      p.area_id,
      p.puesto,
      p.numero_usuarios,
      p.descripcion,
      a.nombre_area

    FROM puestos_trabajo p

    INNER JOIN areas_trabajo a
      ON a.id = p.area_id

    WHERE a.cliente_id = $1

    ORDER BY
      a.nombre_area,
      p.puesto
    `,
    [clienteId],
  );

  // ===================================================
  // 4. INVENTARIO EPP
  // ===================================================

  const inventarioResult = await db.query(
    `
    SELECT
      i.id,
      i.clave_producto,
      i.nombre_producto,
      i.marca,
      i.descripcion,
      i.tipo_producto,
      i.cantidad_total,
      i.area_id,
      i.puesto_id,
      i.ficha_tecnica,
      i.certificado,

      a.nombre_area,

      p.puesto AS puesto_nombre

    FROM inventario i

    INNER JOIN areas_trabajo a
      ON a.id = i.area_id

    INNER JOIN puestos_trabajo p
      ON p.id = i.puesto_id

    WHERE i.cliente_id = $1

      AND (
        i.tipo_producto = 'EPP'
        OR i.tipo_producto IS NULL
      )

    ORDER BY
      a.nombre_area,
      p.puesto,
      i.nombre_producto
    `,
    [clienteId],
  );

  const areas =
    areasResult.rows;

  const puestos =
    puestosResult.rows;

  const inventario =
    inventarioResult.rows;

  // ===================================================
  // 5. CLAVE ÚNICA PARA COMPARACIÓN
  // ===================================================

  const obtenerClaveEpp = (
    producto,
  ) => {
    if (
      producto.clave_producto !==
        null &&
      producto.clave_producto !==
        undefined &&
      String(
        producto.clave_producto,
      ).trim() !== ""
    ) {
      return String(
        producto.clave_producto,
      )
        .trim()
        .toLowerCase();
    }

    return `${producto.nombre_producto || ""}|${producto.marca || ""}`
      .trim()
      .toLowerCase();
  };

  // ===================================================
  // 6. CREAR ESTRUCTURA DE ÁREAS Y PUESTOS
  // ===================================================

  const areasProcesadas =
    areas.map((area) => {
      const puestosArea =
        puestos
          .filter(
            (puesto) =>
              Number(
                puesto.area_id,
              ) ===
              Number(
                area.id,
              ),
          )
          .map((puesto) => {
            const productos =
              inventario.filter(
                (producto) =>
                  Number(
                    producto.puesto_id,
                  ) ===
                  Number(
                    puesto.id,
                  ),
              );

            return {
              puesto_id:
                puesto.id,

              puesto:
                puesto.puesto,

              numero_usuarios:
                puesto.numero_usuarios,

              descripcion:
                puesto.descripcion,

              epp:
                productos.map(
                  (producto) => ({
                    id:
                      producto.id,

                    clave_producto:
                      producto.clave_producto,

                    nombre_producto:
                      producto.nombre_producto,

                    marca:
                      producto.marca,

                    descripcion:
                      producto.descripcion,

                    cantidad_total:
                      producto.cantidad_total,

                    ficha_tecnica:
                      producto.ficha_tecnica,

                    certificado:
                      producto.certificado,
                  }),
                ),
            };
          });

      return {
        area_id:
          area.id,

        nombre_area:
          area.nombre_area,

        descripcion:
          area.descripcion,

        puestos:
          puestosArea,
      };
    });

  // ===================================================
  // 7. TODOS LOS PUESTOS DEL CLIENTE
  //
  // Aquí dejamos de comparar área por área.
  // Ahora TODOS los puestos participan.
  // ===================================================

  const puestosGlobales = [];

  areasProcesadas.forEach(
    (area) => {
      area.puestos.forEach(
        (puesto) => {
          puestosGlobales.push({
            area_id:
              area.area_id,

            nombre_area:
              area.nombre_area,

            puesto_id:
              puesto.puesto_id,

            puesto:
              puesto.puesto,

            epp:
              puesto.epp,
          });
        },
      );
    },
  );

  // ===================================================
  // 8. MAPA GLOBAL DE TODOS LOS EPP
  // ===================================================

  const mapaGlobal =
    new Map();

  inventario.forEach(
    (producto) => {
      const clave =
        obtenerClaveEpp(
          producto,
        );

      if (
        !mapaGlobal.has(
          clave,
        )
      ) {
        mapaGlobal.set(
          clave,
          {
            clave_comparacion:
              clave,

            clave_producto:
              producto.clave_producto,

            nombre_producto:
              producto.nombre_producto,

            marca:
              producto.marca,

            ubicaciones: [],
          },
        );
      }

      const registro =
        mapaGlobal.get(
          clave,
        );

      // Evitar duplicar exactamente
      // área + puesto para el mismo EPP.

      const yaExiste =
        registro.ubicaciones.some(
          (ubicacion) =>
            Number(
              ubicacion.area_id,
            ) ===
              Number(
                producto.area_id,
              ) &&
            Number(
              ubicacion.puesto_id,
            ) ===
              Number(
                producto.puesto_id,
              ),
        );

      if (!yaExiste) {
        registro.ubicaciones.push({
          area_id:
            producto.area_id,

          nombre_area:
            producto.nombre_area,

          puesto_id:
            producto.puesto_id,

          puesto:
            producto.puesto_nombre,
        });
      }
    },
  );

  // ===================================================
  // 9. TOTAL DE PUESTOS A COMPARAR
  // ===================================================

  const totalPuestos =
    puestosGlobales.length;

  // ===================================================
  // 10. EPP IDÉNTICOS
  //
  // Debe aparecer en TODOS los puestos del cliente.
  // ===================================================

  const eppIdenticos = [];

  // ===================================================
  // 11. EPP DIFERENTES
  //
  // Aparecen solamente en determinados puestos.
  // ===================================================

  const eppDiferentes = [];

  mapaGlobal.forEach(
    (producto) => {
      const puestosConProducto =
        new Set(
          producto.ubicaciones.map(
            (ubicacion) =>
              String(
                ubicacion.puesto_id,
              ),
          ),
        );

      // ===============================================
      // IDÉNTICO
      // Está presente en TODOS los puestos
      // ===============================================

      if (
        totalPuestos > 0 &&
        puestosConProducto.size ===
          totalPuestos
      ) {
        eppIdenticos.push({
          clave_producto:
            producto.clave_producto,

          nombre_producto:
            producto.nombre_producto,

          marca:
            producto.marca,

          ubicaciones:
            producto.ubicaciones,
        });
      }

      // ===============================================
      // DIFERENTE
      // Solo está presente en algunos puestos
      // ===============================================

      else {
        eppDiferentes.push({
          clave_producto:
            producto.clave_producto,

          nombre_producto:
            producto.nombre_producto,

          marca:
            producto.marca,

          ubicaciones:
            producto.ubicaciones,
        });
      }
    },
  );

  // ===================================================
  // 12. MATRIZ COMPLETA
  //
  // Esta parte nos será útil para mostrar después
  // columnas por área / puesto.
  // ===================================================

  const matrizComparacion =
    Array.from(
      mapaGlobal.values(),
    ).map(
      (producto) => {
        const presencia =
          puestosGlobales.map(
            (puesto) => {
              const existe =
                producto.ubicaciones.some(
                  (ubicacion) =>
                    Number(
                      ubicacion.puesto_id,
                    ) ===
                    Number(
                      puesto.puesto_id,
                    ),
                );

              return {
                area_id:
                  puesto.area_id,

                nombre_area:
                  puesto.nombre_area,

                puesto_id:
                  puesto.puesto_id,

                puesto:
                  puesto.puesto,

                tiene_epp:
                  existe,
              };
            },
          );

        return {
          clave_producto:
            producto.clave_producto,

          nombre_producto:
            producto.nombre_producto,

          marca:
            producto.marca,

          presencia,
        };
      },
    );

  // ===================================================
  // 13. RESULTADO FINAL
  // ===================================================

  return {
    cliente: {
      id:
        cliente.id,

      nombre_empresa:
        cliente.nombre_empresa,
    },

    areas:
      areasProcesadas,

    comparacion: {
      total_areas:
        areasProcesadas.length,

      total_puestos:
        totalPuestos,

      epp_identicos:
        eppIdenticos,

      epp_diferentes:
        eppDiferentes,

      matriz:
        matrizComparacion,
    },
  };
};

// =====================================================
// PREVISUALIZAR NUEVO REGISTRO
// NO GUARDA NADA
// =====================================================

app.get(
  "/registros-epp/preview/:clienteId",
  async (req, res) => {
    try {
      const clienteId =
        parseInt(
          req.params.clienteId,
          10,
        );

      if (!clienteId) {
        return res.status(400).json({
          success: false,
          error:
            "clienteId inválido",
        });
      }

      const snapshot =
        await construirSnapshotEpp(
          clienteId,
        );

      const ahora =
        new Date();

      res.json({
        success: true,

        fecha_hora:
          ahora.toISOString(),

        snapshot,
      });
    } catch (error) {
      console.error(
        "ERROR GENERANDO PREVISUALIZACIÓN EPP:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          error.message,
      });
    }
  },
);

// =====================================================
// GUARDAR NUEVO REGISTRO HISTÓRICO
// =====================================================

app.post(
  "/registros-epp",
  async (req, res) => {
    const client =
      await db.connect();

    try {
      const {
        cliente_id,
        usuario_id,
      } = req.body;

      const clienteId =
        parseInt(
          cliente_id,
          10,
        );

      const usuarioId =
        usuario_id
          ? parseInt(
              usuario_id,
              10,
            )
          : null;

      if (!clienteId) {
        return res.status(400).json({
          success: false,
          error:
            "cliente_id es requerido",
        });
      }

      console.log(
        "====================================",
      );
      console.log(
        "GUARDANDO HISTÓRICO EPP",
      );
      console.log(
        "CLIENTE:",
        clienteId,
      );
      console.log(
        "USUARIO:",
        usuarioId,
      );
      console.log(
        "====================================",
      );

      // ===============================================
      // CONSTRUIR SNAPSHOT DESDE LOS DATOS ACTUALES
      //
      // IMPORTANTE:
      // No confiamos en un snapshot enviado
      // por el frontend.
      // El backend construye el snapshot real.
      // ===============================================

      const snapshot =
        await construirSnapshotEpp(
          clienteId,
        );

      await client.query(
        "BEGIN",
      );

      const result =
        await client.query(
          `
          INSERT INTO registros_epp_historico
          (
            cliente_id,
            usuario_id,
            nombre_empresa,
            fecha_registro,
            hora_registro,
            snapshot
          )

          VALUES
          (
            $1,
            $2,
            $3,
            CURRENT_DATE,
            CURRENT_TIME,
            $4::jsonb
          )

          RETURNING
            id,
            cliente_id,
            usuario_id,
            nombre_empresa,
            fecha_registro,
            hora_registro,
            created_at
          `,
          [
            clienteId,
            usuarioId,
            snapshot.cliente
              .nombre_empresa,
            JSON.stringify(
              snapshot,
            ),
          ],
        );

      await client.query(
        "COMMIT",
      );

      console.log(
        "REGISTRO HISTÓRICO GUARDADO:",
        result.rows[0],
      );

      res.json({
        success: true,

        message:
          "Registro guardado correctamente",

        registro:
          result.rows[0],

        snapshot,
      });
    } catch (error) {
      try {
        await client.query(
          "ROLLBACK",
        );
      } catch (
        rollbackError
      ) {
        console.log(
          "ERROR ROLLBACK:",
          rollbackError.message,
        );
      }

      console.error(
        "ERROR GUARDANDO HISTÓRICO EPP:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          error.message,
      });
    } finally {
      client.release();
    }
  },
);

// =====================================================
// LISTAR REGISTROS ANTERIORES DEL CLIENTE
// =====================================================

app.get(
  "/registros-epp/cliente/:clienteId",
  async (req, res) => {
    try {
      const clienteId =
        parseInt(
          req.params.clienteId,
          10,
        );

      if (!clienteId) {
        return res.status(400).json({
          success: false,
          error:
            "clienteId inválido",
        });
      }

      const result =
        await db.query(
          `
          SELECT
            id,
            cliente_id,
            usuario_id,
            nombre_empresa,
            fecha_registro,
            hora_registro,
            created_at

          FROM registros_epp_historico

          WHERE cliente_id = $1

          ORDER BY
            fecha_registro DESC,
            hora_registro DESC,
            id DESC
          `,
          [
            clienteId,
          ],
        );

      res.json({
        success: true,

        registros:
          result.rows,
      });
    } catch (error) {
      console.error(
        "ERROR CONSULTANDO HISTÓRICO EPP:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          error.message,
      });
    }
  },
);

// =====================================================
// OBTENER REGISTRO HISTÓRICO COMPLETO
// =====================================================

app.get(
  "/registros-epp/detalle/:registroId",
  async (req, res) => {
    try {
      const registroId =
        parseInt(
          req.params.registroId,
          10,
        );

      if (!registroId) {
        return res.status(400).json({
          success: false,
          error:
            "registroId inválido",
        });
      }

      const result =
        await db.query(
          `
          SELECT
            id,
            cliente_id,
            usuario_id,
            nombre_empresa,
            fecha_registro,
            hora_registro,
            snapshot,
            created_at

          FROM registros_epp_historico

          WHERE id = $1

          LIMIT 1
          `,
          [
            registroId,
          ],
        );

      if (
        result.rows.length === 0
      ) {
        return res.status(404).json({
          success: false,
          error:
            "El registro no existe",
        });
      }

      res.json({
        success: true,

        registro:
          result.rows[0],
      });
    } catch (error) {
      console.error(
        "ERROR CONSULTANDO REGISTRO EPP:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          error.message,
      });
    }
  },
);

// =====================================================
// FECHAS CON REGISTROS PARA EL CALENDARIO
// =====================================================

app.get(
  "/registros-epp/calendario/:clienteId",
  async (req, res) => {
    try {
      const clienteId =
        parseInt(
          req.params.clienteId,
          10,
        );

      if (!clienteId) {
        return res.status(400).json({
          success: false,
          error:
            "clienteId inválido",
        });
      }

      const result =
        await db.query(
          `
          SELECT
            fecha_registro,
            COUNT(*)::INTEGER AS cantidad

          FROM registros_epp_historico

          WHERE cliente_id = $1

          GROUP BY fecha_registro

          ORDER BY fecha_registro DESC
          `,
          [
            clienteId,
          ],
        );

      res.json({
        success: true,

        fechas:
          result.rows,
      });
    } catch (error) {
      console.error(
        "ERROR CONSULTANDO CALENDARIO EPP:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          error.message,
      });
    }
  },
);

// =====================================================
// GUARDAR INSPECCIÓN SEMANAL DE CONDICIONES DEL INMUEBLE
// =====================================================

app.post("/registros-semanales", async (req, res) => {
  let client;

  try {
    client = await db.connect();

    const {
      cliente_id,
      usuario_id,
      tipo_registro,
      condiciones,
    } = req.body;

    console.log("========================================");
    console.log("POST /registros-semanales");
    console.log("BODY:", req.body);
    console.log("========================================");

    // =====================================================
    // VALIDAR CLIENTE
    // =====================================================

    if (!cliente_id) {
      return res.status(400).json({
        success: false,
        error: "El cliente_id es obligatorio.",
      });
    }

    // =====================================================
    // VALIDAR TIPO
    // =====================================================

    if (tipo_registro !== "semanal") {
      return res.status(400).json({
        success: false,
        error: "El tipo_registro debe ser semanal.",
      });
    }

    // =====================================================
    // VALIDAR CONDICIONES
    // =====================================================

    if (!Array.isArray(condiciones) || condiciones.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Debes enviar las condiciones del inmueble.",
      });
    }

    const condicionesPermitidas = [
      "Techo",
      "Paredes",
      "Pisos",
      "Rampas",
      "Escaleras",
      "Tuberías",
      "Salidas de Emergencia",
    ];

    // =====================================================
    // DEBEN SER EXACTAMENTE 7
    // =====================================================

    if (condiciones.length !== condicionesPermitidas.length) {
      return res.status(400).json({
        success: false,
        error:
          "El registro semanal debe contener exactamente las 7 condiciones.",
      });
    }

    // =====================================================
    // VALIDAR CADA CONDICIÓN
    // =====================================================

    for (const item of condiciones) {
      if (!item.nombre) {
        return res.status(400).json({
          success: false,
          error: "Todas las condiciones deben tener nombre.",
        });
      }

      if (!condicionesPermitidas.includes(item.nombre)) {
        return res.status(400).json({
          success: false,
          error: `Condición no permitida: ${item.nombre}`,
        });
      }

      if (
        item.estado !== "bueno" &&
        item.estado !== "malo"
      ) {
        return res.status(400).json({
          success: false,
          error: `Estado inválido para ${item.nombre}.`,
        });
      }

      if (item.estado === "malo") {
        if (
          !item.condicion ||
          !String(item.condicion).trim()
        ) {
          return res.status(400).json({
            success: false,
            error: `Debes agregar la condición detectada para ${item.nombre}.`,
          });
        }

        if (
          !item.accion_correctiva ||
          !String(item.accion_correctiva).trim()
        ) {
          return res.status(400).json({
            success: false,
            error: `Debes agregar la acción correctiva para ${item.nombre}.`,
          });
        }
      }
    }

    // =====================================================
    // VALIDAR DUPLICADOS
    // =====================================================

    const nombresRecibidos = condiciones.map(
      (item) => item.nombre,
    );

    const nombresUnicos = new Set(nombresRecibidos);

    if (nombresUnicos.size !== condicionesPermitidas.length) {
      return res.status(400).json({
        success: false,
        error:
          "Existen condiciones duplicadas o faltantes.",
      });
    }

    // =====================================================
    // CONSULTAR CLIENTE
    // =====================================================

    const clienteResult = await client.query(
      `
      SELECT
        id,
        nombre_empresa
      FROM clientes
      WHERE id = $1
      LIMIT 1
      `,
      [cliente_id],
    );

    if (clienteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "El cliente no existe.",
      });
    }

    const cliente = clienteResult.rows[0];

    // =====================================================
    // INICIAR TRANSACCIÓN
    // =====================================================

    await client.query("BEGIN");

    // =====================================================
    // GUARDAR ENCABEZADO
    // =====================================================

    const inspeccionResult = await client.query(
      `
      INSERT INTO inspecciones_semanales (
        cliente_id,
        usuario_id,
        nombre_empresa,
        fecha_registro,
        hora_registro
      )
      VALUES (
        $1,
        $2,
        $3,
        CURRENT_DATE,
        CURRENT_TIME
      )
      RETURNING
        id,
        cliente_id,
        usuario_id,
        nombre_empresa,
        fecha_registro,
        hora_registro,
        created_at
      `,
      [
        cliente_id,
        usuario_id || null,
        cliente.nombre_empresa,
      ],
    );

    const inspeccion = inspeccionResult.rows[0];

    // =====================================================
    // GUARDAR LAS 7 CONDICIONES
    // =====================================================

    for (const item of condiciones) {
  const {
    nombre,
    estado,
    condicion,
    accion_correctiva,
  } = item;

  await client.query(
    `
    INSERT INTO inspecciones_semanales_detalle
    (
      inspeccion_id,
      seccion,
      nombre_condicion,
      estado,
      condicion,
      accion_correctiva
    )
    VALUES
    (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6
    )
    `,
    [
      inspeccion.id,
      "condiciones_inmueble",
      nombre,
      estado,
      estado === "malo"
        ? String(condicion || "").trim()
        : null,
      estado === "malo"
        ? String(accion_correctiva || "").trim()
        : null,
    ],
  );
}

    // =====================================================
    // CONFIRMAR
    // =====================================================

    await client.query("COMMIT");

    console.log(
      "REGISTRO SEMANAL GUARDADO:",
      inspeccion.id,
    );

    return res.status(201).json({
      success: true,
      message: "Registro semanal guardado correctamente.",
      registro: inspeccion,
    });
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.log(
          "ERROR HACIENDO ROLLBACK:",
          rollbackError.message,
        );
      }
    }

    console.log(
      "ERROR POST /registros-semanales:",
      error,
    );

    return res.status(500).json({
      success: false,
      error: "Error al guardar el registro semanal.",
      detalle: error.message,
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});

// =====================================================
// GUARDAR PROTECCIÓN CONTRA INCENDIOS
// INSPECCIÓN SEMANAL
// =====================================================

app.post(
  "/registros-semanales/incendios",
  async (req, res) => {
    let client;

    try {
      client = await db.connect();

      const {
        cliente_id,
        usuario_id,
        tipo_registro,
        condiciones,
      } = req.body;

      console.log(
        "========================================",
      );

      console.log(
        "POST /registros-semanales/incendios",
      );

      console.log(
        "BODY:",
        req.body,
      );

      console.log(
        "========================================",
      );

      // =====================================================
      // VALIDAR CLIENTE
      // =====================================================

      if (!cliente_id) {
        return res.status(400).json({
          success: false,
          error:
            "cliente_id es requerido.",
        });
      }

      // =====================================================
      // VALIDAR TIPO
      // =====================================================

      if (
        tipo_registro !==
        "proteccion_incendios"
      ) {
        return res.status(400).json({
          success: false,
          error:
            "El tipo_registro debe ser proteccion_incendios.",
        });
      }

      // =====================================================
      // VALIDAR ARRAY
      // =====================================================

      if (!Array.isArray(condiciones)) {
        return res.status(400).json({
          success: false,
          error:
            "condiciones debe ser un arreglo.",
        });
      }

      // =====================================================
      // ELEMENTOS OBLIGATORIOS
      // =====================================================

      const condicionesEsperadas = [
        "Gabinete",
        "Señalización",
        "Extintores",
        "Estrobos",
        "Hidrantes",
        "Rutas de Evacuación",
      ];

      if (
        condiciones.length !==
        condicionesEsperadas.length
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Deben enviarse exactamente 6 registros de Protección contra Incendios.",
        });
      }

      // =====================================================
      // VALIDAR NOMBRES
      // =====================================================

      const nombresRecibidos =
        condiciones.map(
          (item) => item.nombre,
        );

      const faltantes =
        condicionesEsperadas.filter(
          (nombre) =>
            !nombresRecibidos.includes(
              nombre,
            ),
        );

      if (faltantes.length > 0) {
        return res.status(400).json({
          success: false,
          error:
            `Faltan las siguientes verificaciones: ${faltantes.join(
              ", ",
            )}`,
        });
      }

      // =====================================================
      // VALIDAR DUPLICADOS
      // =====================================================

      const nombresUnicos =
        new Set(nombresRecibidos);

      if (
        nombresUnicos.size !==
        condicionesEsperadas.length
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Existen verificaciones duplicadas.",
        });
      }

      // =====================================================
      // VALIDAR CONTENIDO DE CADA REGISTRO
      // =====================================================

      for (const item of condiciones) {
        const {
          nombre,
          estado,
          condicion,
          accion_correctiva,
        } = item;

        if (
          !["bueno", "malo"].includes(
            estado,
          )
        ) {
          return res.status(400).json({
            success: false,
            error:
              `El estado de "${nombre}" debe ser bueno o malo.`,
          });
        }

        if (estado === "malo") {
          if (
            !condicion ||
            !String(
              condicion,
            ).trim()
          ) {
            return res.status(400).json({
              success: false,
              error:
                `"${nombre}" está marcado como Malo y requiere Condición.`,
            });
          }

          if (
            !accion_correctiva ||
            !String(
              accion_correctiva,
            ).trim()
          ) {
            return res.status(400).json({
              success: false,
              error:
                `"${nombre}" está marcado como Malo y requiere Acción correctiva.`,
            });
          }
        }
      }

      // =====================================================
      // VERIFICAR CLIENTE
      // =====================================================

      const clienteResult =
        await client.query(
          `
          SELECT
            id,
            nombre_empresa
          FROM clientes
          WHERE id = $1
          `,
          [cliente_id],
        );

      if (
        clienteResult.rows.length === 0
      ) {
        return res.status(404).json({
          success: false,
          error:
            "El cliente indicado no existe.",
        });
      }

      const cliente =
        clienteResult.rows[0];

      // =====================================================
      // INICIAR TRANSACCIÓN
      // =====================================================

      await client.query("BEGIN");

      // =====================================================
      // BUSCAR INSPECCIÓN DE HOY
      //
      // SI YA SE GUARDÓ CONDICIONES DEL INMUEBLE
      // REUTILIZAMOS LA MISMA INSPECCIÓN
      // =====================================================

      const inspeccionExistente =
        await client.query(
          `
          SELECT
            id,
            cliente_id,
            usuario_id,
            nombre_empresa,
            fecha_registro,
            hora_registro,
            created_at

          FROM inspecciones_semanales

          WHERE cliente_id = $1
            AND fecha_registro = CURRENT_DATE

          ORDER BY id DESC

          LIMIT 1
          `,
          [cliente_id],
        );

      let inspeccion;

      if (
        inspeccionExistente.rows.length >
        0
      ) {
        inspeccion =
          inspeccionExistente.rows[0];

        console.log(
          "REUTILIZANDO INSPECCIÓN:",
          inspeccion.id,
        );
      } else {
        const nuevaInspeccion =
          await client.query(
            `
            INSERT INTO inspecciones_semanales
            (
              cliente_id,
              usuario_id,
              nombre_empresa,
              fecha_registro,
              hora_registro
            )
            VALUES
            (
              $1,
              $2,
              $3,
              CURRENT_DATE,
              CURRENT_TIME
            )

            RETURNING
              id,
              cliente_id,
              usuario_id,
              nombre_empresa,
              fecha_registro,
              hora_registro,
              created_at
            `,
            [
              cliente_id,
              usuario_id || null,
              cliente.nombre_empresa,
            ],
          );

        inspeccion =
          nuevaInspeccion.rows[0];

        console.log(
          "NUEVA INSPECCIÓN:",
          inspeccion.id,
        );
      }

      // =====================================================
      // ELIMINAR REGISTROS ANTERIORES DE INCENDIOS
      // PARA ESA MISMA INSPECCIÓN
      //
      // ESTO PERMITE CORREGIR / VOLVER A GUARDAR
      // SIN DUPLICAR LOS 6 REGISTROS
      // =====================================================

      await client.query(
        `
        DELETE FROM inspecciones_semanales_detalle

        WHERE inspeccion_id = $1
          AND seccion = $2
        `,
        [
          inspeccion.id,
          "proteccion_incendios",
        ],
      );

      // =====================================================
      // INSERTAR LOS 6 REGISTROS
      // =====================================================

      for (const item of condiciones) {
        const {
          nombre,
          estado,
          condicion,
          accion_correctiva,
        } = item;

        await client.query(
          `
          INSERT INTO inspecciones_semanales_detalle
          (
            inspeccion_id,
            seccion,
            nombre_condicion,
            estado,
            condicion,
            accion_correctiva
          )
          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6
          )
          `,
          [
            inspeccion.id,
            "proteccion_incendios",
            nombre,
            estado,
            estado === "malo"
              ? String(
                  condicion,
                ).trim()
              : null,
            estado === "malo"
              ? String(
                  accion_correctiva,
                ).trim()
              : null,
          ],
        );
      }

      // =====================================================
      // CONFIRMAR
      // =====================================================

      await client.query("COMMIT");

      console.log(
        "PROTECCIÓN CONTRA INCENDIOS GUARDADA",
      );

      console.log(
        "INSPECCIÓN:",
        inspeccion.id,
      );

      return res
        .status(201)
        .json({
          success: true,

          message:
            "Protección contra Incendios guardada correctamente.",

          registro: inspeccion,
        });
    } catch (error) {
      if (client) {
        try {
          await client.query(
            "ROLLBACK",
          );
        } catch (
          rollbackError
        ) {
          console.log(
            "ERROR HACIENDO ROLLBACK:",
            rollbackError.message,
          );
        }
      }

      console.error(
        "========================================",
      );

      console.error(
        "ERROR POST /registros-semanales/incendios:",
        error,
      );

      console.error(
        "========================================",
      );

      return res.status(500).json({
        success: false,

        error:
          "Error al guardar Protección contra Incendios.",

        detalle:
          error.message,
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  },
);

// ------------------- INICIAR SERVIDOR -------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor backend escuchando en el puerto ${PORT}`);
});
