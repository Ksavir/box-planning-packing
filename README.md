# PackFlow MVP

PackFlow convierte órdenes de compra recibidas como PDF, correo, llamada o mensaje en planes de empaque verificables. El MVP extrae los datos de documentos conocidos, permite registrar una orden manualmente, relaciona cada producto por su nombre o descripción con el catálogo y calcula una distribución tridimensional que respeta dimensiones y peso.

## Stack

- React 19, TypeScript y Vite.
- FastAPI y Python 3.12.
- SQLite, sin servicio de base de datos externo.
- `pypdf` para PDFs con texto.
- `openpyxl` para los catálogos Excel.
- Motor propio de first-fit decreasing 3D con partición guillotina.

## Ejecutar en desarrollo

### API

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8001
```

La documentación interactiva queda disponible en `http://127.0.0.1:8001/docs`.

### Web

```bash
cd frontend
npm install
npm run dev
```

Abre `http://127.0.0.1:5173`. Vite redirige las llamadas `/api` al puerto `8001`.

## Catálogos Excel

La primera fila debe contener encabezados. Se aceptan variantes en español e inglés.

Productos:

| Campo | Ejemplos de encabezado |
| --- | --- |
| Nombre | `nombre`, `descripción`, `name` |
| Largo | `largo`, `largo cm`, `length` |
| Ancho | `ancho`, `ancho cm`, `width` |
| Alto | `alto`, `alto cm`, `height` |
| Peso | `peso`, `peso kg`, `weight` |

Cajas:

| Campo | Ejemplos de encabezado |
| --- | --- |
| Código | `código`, `code`, `caja` |
| Nombre | `nombre`, `name` |
| Largo, ancho y alto | `largo`, `ancho`, `alto` |
| Peso vacío | `peso caja`, `tara`, `empty weight` |
| Peso máximo | `peso máximo`, `capacidad kg`, `max weight` |

Las dimensiones se expresan en centímetros y los pesos en kilogramos. Los productos con el mismo nombre y las cajas con el mismo código se actualizan durante una importación.

El importador también reconoce directamente el libro operativo `Volume - weight calculator.xlsx`. En una sola carga toma los pesos de `boxes bottles volumes` y los tipos de caja de `box types-what fits`, convierte milímetros a centímetros y gramos a kilogramos, y vuelve a relacionar las órdenes existentes por descripción. Como el archivo no incluye el peso máximo admitido por caja, el MVP utiliza temporalmente 25 kg para los tipos importados.

## Flujo del MVP

1. Abre **Nuevo análisis** y elige **Desde PDF** o **Captura manual**.
2. En el flujo manual registra la información disponible en el correo o mensaje del cliente.
3. Revisa comprador, proveedor, número, fechas, condiciones, direcciones y totales.
4. Confirma descripción, cantidad, precio, impuestos, descuento, fecha solicitada e importe por línea.
5. Corrige o agrega las líneas que hagan falta.
6. Pulsa **Validar y calcular**.
7. Examina la ocupación, el peso, el contenido y las recomendaciones de cada caja.
8. Exporta el resultado a Excel con hojas de resumen, cajas y contenido.

## Información de una orden

La estructura normalizada admite:

- Número de orden, comprador, proveedor y origen (`pdf` o `manual`).
- Fecha de emisión y fecha solicitada.
- Moneda, términos, notas, dirección de entrega y facturación.
- Subtotal, impuestos y total.
- Por línea: descripción del producto, cantidad, precio unitario, impuesto, descuento, fecha solicitada e importe.

Actualmente existen extractores específicos para los formatos de Rev1 Technologies y Hava 3D, además de un extractor genérico conservador.

El repositorio incluye productos, cajas y tres órdenes de demostración. La base se crea en `backend/data/packflow.db` en el primer arranque.

## Verificación

```bash
cd backend
PYTHONPATH=. .venv/bin/python -m unittest discover -s tests -v

cd ../frontend
npm run build
```

## Límites actuales

- La extracción automática admite PDFs que contienen texto. Los escaneos requieren integrar OCR en la siguiente iteración.
- Los formatos Rev1 Technologies y Hava 3D se reconocen de forma específica. Otros diseños usan una extracción conservadora y requieren revisión.
- El algoritmo busca una solución práctica y reproducible. No garantiza el óptimo matemático global del problema 3D bin packing.
- No se han implementado autenticación, permisos, almacenamiento externo ni auditoría avanzada.
