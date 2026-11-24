# MBOS.Hub.BackToSchool.Web

Frontend de **BackToSchool** (Angular 20 + Tailwind 4), instalable como **PWA**: en el celular se
abre el enlace y se toca "Instalar app" / "Agregar a pantalla de inicio". Necesita internet (los
pedidos tienen que llegar a almacén). API: `MBOS.Hub.BackToSchool`.

Misma estructura que `MBOS.Hub.CheckInvoice.Web`: `core/` (auth, menú, i18n, tema, toasts, ventas),
`shared/` (componentes), `layout/shell`, `features/`.

## Pantallas

| Ruta | Rol | Para qué |
|---|---|---|
| `/orders/new` | Promotor | Armar el pedido en el celular: Datos → Textos (por hijo y curso) → Uniformes (prenda → talla) → Cuadernos → Otros → Resumen. El total se ve siempre abajo. Al finalizar muestra el **número de ficha** |
| `/orders` | Todos | Pedidos del día; el promotor ve los suyos. Buscar por N° de ficha o nombre |
| `/warehouse` | Almacén | Cola en vivo (cada 5 s, con sonido): Nuevos → En almacén → Listos en caja. Imprimir hoja / Listo en caja |
| `/catalog/products` | Administrador | Precios (se escriben en la lista y se guardan juntos), alta/edición de productos |
| `/catalog/courses` | Administrador | Lista de textos de cada curso, orden, opcionales |
| `/catalog/schools` | Administrador | Colegios |

## Íconos

Los íconos del sistema son los SVG de `src/app/shared/icons`. Para usar uno nuevo: copiar el SVG
ahí, correr `python -I scripts/build-icons.py` y usarlo con `<app-icon name="nombre" size="size-5" />`
(el nombre es el del archivo sin `-svgrepo-com.svg`). El script les cambia el color fijo por el del
tema. En el menú lateral, el ícono es el valor de la columna `menu.icon`.

## Desarrollo

```bash
npm install
npm start            # http://localhost:4200, con proxy /api → http://localhost:5027 (proxy.conf.json)
```

Por ahora todo corre en local (`localhost`). El acceso desde celulares se habilita cuando la app
esté en el servidor definitivo con su dominio y HTTPS (requisito del navegador para instalar la PWA).

El service worker (`ngsw-config.json`) solo se activa en el build de producción.

## Producción

```bash
npm run build        # dist/MBOS.Hub.BackToSchool.Web/browser
docker build -t backtoschool-web .
```

`nginx.conf` sirve la app y manda `/api/` al contenedor `backtoschool-backend:8080`.
