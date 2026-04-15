# markdown-to-pdf-api

![Node.js](https://img.shields.io/badge/node-20-green) ![Express](https://img.shields.io/badge/express-4.x-blue) ![License](https://img.shields.io/badge/license-MIT-lightgrey)

API REST que convierte Markdown a PDF, HTML o texto plano. Soporta 4 temas de estilo (default, dark, github, minimal). Sin dependencias de Chromium — generacion de PDF pura con pdfkit.

## Instalacion en 3 comandos

```bash
git clone https://github.com/Quesillo27/markdown-to-pdf-api
cd markdown-to-pdf-api
npm install
```

## Uso

```bash
npm start   # inicia el servicio en puerto 3000
```

## Ejemplos

```bash
# Convertir markdown a PDF (descarga el archivo)
curl -X POST http://localhost:3000/convert \
  -H "Content-Type: application/json" \
  -d '{"markdown":"# Hello World\nEsto es **negrita**.", "options":{"theme":"github","title":"Mi Documento"}}' \
  -o documento.pdf

# Obtener HTML con tema dark
curl -X POST "http://localhost:3000/convert?format=html&theme=dark" \
  -H "Content-Type: application/json" \
  -d '{"markdown":"# Titulo\nContenido aqui"}' > output.html

# Analizar markdown (estadisticas sin convertir)
curl -X POST http://localhost:3000/analyze \
  -H "Content-Type: application/json" \
  -d '{"markdown":"# Mi doc\nTexto con **negritas** y [links](https://example.com)."}'
# → {"stats":{"wordCount":8,"charCount":38,"headingCount":1,"codeBlockCount":0,"linkCount":1,"estimatedReadTime":1}}
```

## API

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/health` | Estado del servicio y temas disponibles |
| GET | `/themes` | Lista de temas CSS disponibles |
| POST | `/convert` | Convierte markdown a PDF, HTML o texto |
| POST | `/analyze` | Analiza markdown y retorna estadisticas |

### POST /convert

**Body (JSON):**
```json
{
  "markdown": "# Titulo\nContenido...",
  "options": {
    "format": "pdf",
    "theme": "github",
    "title": "Mi Documento",
    "author": "Autor",
    "filename": "reporte.pdf"
  }
}
```

**Query params:** `format=pdf|html|text` y `theme=default|dark|github|minimal`

**Respuestas:**
- `format=pdf` → `application/pdf` (buffer descargable)
- `format=html` → `text/html` (pagina completa con CSS inline)
- `format=text` → `text/plain` (texto sin formato)

### POST /analyze

```json
{ "markdown": "# Titulo\nTexto..." }
```

Respuesta:
```json
{
  "stats": {
    "wordCount": 150,
    "charCount": 820,
    "headingCount": 4,
    "codeBlockCount": 2,
    "linkCount": 3,
    "estimatedReadTime": 1
  }
}
```

## Variables de entorno

| Variable | Default | Descripcion |
|----------|---------|-------------|
| PORT | 3000 | Puerto del servidor |

## Docker

```bash
docker build -t markdown-to-pdf-api .
docker run -p 3000:3000 markdown-to-pdf-api
```

## Contribuir

PRs bienvenidos. Corre `npm test` antes de enviar.
