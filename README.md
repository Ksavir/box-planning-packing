# PackFlow MVP

PackFlow convierte órdenes de compra recibidas como PDF, correo, llamada o mensaje en planes de empaque verificables. El MVP extrae los datos de documentos conocidos, permite registrar una orden manualmente, relaciona cada producto por su nombre o descripción con el catálogo y calcula una distribución tridimensional que respeta dimensiones y peso.

## Stack

- React 19, TypeScript y Vite.
- FastAPI y Python 3.12.
- SQLite, sin servicio de base de datos externo.
- `pypdf` para PDFs con texto y ReportLab para informes PDF.
- `openpyxl` para los catálogos Excel.
- Motor 3D con búsqueda acotada de combinaciones de cajas y múltiples ordenaciones y particiones guillotina.

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

- Número de orden, comprador, proveedor y origen (`pdf`, `manual` o `email`).
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

## Nuevas funciones del backend

### Orden desde el texto de un correo

`POST /api/orders/email` recibe JSON. `text` es obligatorio; `client`, `subject` y
`order_number` son opcionales. Si falta el número, se genera uno único.

```json
{
  "text": "Hi Alex,\nMagigoo Pro PP – 15 pcs\nMagigoo Pro PA – 15 pcs\nMagigoo Original 120ml – 15 pcs\nBest regards,\nQing",
  "subject": "Pricing and lead time"
}
```

Devuelve la orden guardada con `source_type: "email"` y `status: "needs_review"`.
El ejemplo produce tres líneas de 15 unidades. Reconoce cantidades explícitas como
`15 pcs`, `7 unidades`, `15 x Producto`, `Producto x 15` y `Producto - 15`.
No confunde `120ml` con una cantidad, y omite firmas e historial citado.
Conserva el correo completo en las notas. Los precios quedan en cero (pendientes),
sin inventar importes, y los productos se relacionan con el catálogo disponible.
La información restante se completa mediante `PATCH /api/orders/{id}`. Si no puede
extraer ninguna línea, devuelve 422. No conecta con el buzón ni envía correos.

### Guardar y descargar el análisis final en PDF

Después de calcular un plan completo:

- `POST /api/orders/{id}/reports`: guarda una copia PDF en SQLite y devuelve `id`,
  `plan_id`, `filename`, `created_at` y `download_url`. Repetirlo para el mismo plan
  devuelve el informe ya guardado.
- `GET /api/orders/{id}/reports`: lista las copias guardadas.
- `GET /api/orders/{id}/reports/{report_id}/pdf`: descarga una copia concreta.
- `GET /api/orders/{id}/export.pdf`: guarda y descarga directamente el plan actual.

El PDF incluye datos de la orden, resumen, líneas principales y adicionales,
contenido por caja, posiciones y orientaciones de cada unidad, límites de peso y
recomendaciones. Identifica los precios pendientes y los totales provisionales.
Rechaza órdenes sin plan completo con 422. Los informes guardados son copias
inmutables: una revisión de la orden invalida el plan actual, pero conserva los PDF
anteriores. La exportación Excel existente sigue en `/api/orders/{id}/export`.

### Selección de cajas y relleno

El criterio principal es minimizar el volumen total de las cajas para la orden
principal, equivalente a minimizar el espacio sobrante. A igual volumen, elige
menos cajas. Por ello puede preferir varias cajas pequeñas a una grande si dejan
menos espacio libre en conjunto. Evalúa una búsqueda de hasta 16 estados por nivel
y varias ordenaciones de productos y órdenes de corte, comprobando dimensiones,
rotación permitida y peso incluyendo la tara. Es una búsqueda heurística acotada;
no garantiza el óptimo matemático global.

Las recomendaciones prueban unidades adicionales dentro de los espacios libres
reales, sin aumentar el tamaño ni el número de cajas ni mover la orden principal.
También funcionan con precios pendientes. Se ordenan por mayor ocupación prevista
y, en caso de empate, menor importe adicional. Cada propuesta es una alternativa
independiente de hasta 100 unidades de un producto de la orden principal;
no constituye una combinación conjunta óptima. Se recalculan al aplicar una
propuesta. Intentar agregar más unidades de las que caben devuelve 422 y revierte
la operación completa, incluidos importes y líneas adicionales.

La interfaz incluye **New order → From email** para pegar un correo y continuar
con la revisión y el cálculo. En un plan completo, **Save plan & go home** guarda
el PDF y vuelve al inicio. **Delete all orders** está disponible en el inicio y en
la lista de órdenes, con confirmación explícita antes del borrado.

`DELETE /api/orders` elimina todas las órdenes, sus líneas, planes e informes PDF
en una sola transacción. Devuelve `deleted_orders`; conserva productos y cajas.
Las órdenes de demostración no se recrean después del borrado al reiniciar.

## Publicar una demo gratuita

La app está preparada para desplegarse completa como un único servicio Docker en
Render Free. Consulta [la guía de despliegue](docs/DEPLOY.md). El plan gratuito
utiliza almacenamiento temporal: las órdenes y los PDF se pierden al reiniciar.
