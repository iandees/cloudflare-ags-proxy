/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `wrangler dev src/index.ts` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `wrangler publish src/index.ts --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
import { Hono } from 'hono'
import { cache } from 'hono/cache'
import { cors } from 'hono/cors'
import { etag } from 'hono/etag'
import TileifyAGS from "tileify-ags";

const app = new Hono()

app.use('/*', cors())
app.use('/*', etag())
app.get('/*', cache({
    cacheName: 'ags-proxy',
    cacheControl: 'public, max-age=604800',
}))

export interface Env {
    // Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
    // MY_KV_NAMESPACE: KVNamespace;
    //
    // Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
    // MY_DURABLE_OBJECT: DurableObjectNamespace;
    //
    // Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
    // MY_BUCKET: R2Bucket;
}

app.get('/tiles/:zoom/:x/:y', async c => {
    const zoom = parseInt(c.req.param('zoom'))
    const x = parseInt(c.req.param('x'))
    const y = parseInt(c.req.param('y'))
    let agsUrl = c.req.query('url')
    const pixelRatio = 1

    if (!agsUrl) {
        c.status(400)
        return c.text('Missing url parameter')
    }

    agsUrl = decodeURIComponent(agsUrl)
    console.log('url query =>' + agsUrl)

    const agsParams = {
        transparent: 'true',
    }

    const tiler = new TileifyAGS(agsUrl, agsParams, pixelRatio)
    const url = tiler.getTileUrl(x, y, zoom)
    console.log(`For tile ${zoom}/${x}/${y} => url ${url}`)

    const resp = await fetch(url, {
        signal: AbortSignal.timeout(10000),
    })

    console.log(`Response from server: HTTP ${resp.status}`)

    if (resp.status != 200 || !resp.body) {
        c.status(503)
        return c.text('Error from proxied server')
    }

    const contentType = resp.headers.get('content-type')
    c.header('content-type', contentType)

    return c.body(resp.body, 200)
});

app.get('/favicon.ico', c => {
    return c.notFound();
});

app.get('/app.css', c => {
    const css = `html, body {
  margin: 0;
  padding: 0;
  height: 100%;
}

.wrapper {
  height: 100%;
}

#map {
  height: 100%;
  margin-left: 300px;
}

.left {
  width: 300px;
  max-width: 100%;
  max-height: 100%;
  overflow-y: auto;
  height: 100%;
  float: left;
  padding: 10px;
}

.left h3 {
  margin-top: 0;
}

.params {
  margin-bottom: 5px;
}

.params .param {
  width: 130px;
  display: inline;
}

.params .param-value {
  float: right;
}`

    return c.text(css, 200, {'content-type': 'text/css'});
})

app.get('/app.js', c => {
    const js = `(function(){
  var base_layer = new L.TileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  var map_options = {
    center: [40.203,-95.382],
    zoom: 4,
    layers: [base_layer],
    maxZoom: 21
  };
  var map = new L.Map('map', map_options);

  var ags_layer;

  function updateLayer(event) {
    if (event) {
      event.preventDefault();
    }
    var url = window.location.origin + '/tiles/{z}/{x}/{y}';
    var params = (function() {
      var encoded_ags_url = window.encodeURIComponent($('#ags_url').val());
      var key_vals = ['url=' + encoded_ags_url];
      $('.params').each(function (index, object) {
        var $param = $(object);
        var key = $param.find('.param-key').val();
        var value = $param.find('.param-value').val();
        if (key.length && value.length) {
          key_vals.push(key + '=' + window.encodeURIComponent(value));
        }
      });
      return key_vals;
    }());
    var url_template = url + '?' + params.join('&');
    $('#proxy_url_template').val(url_template);
    if (ags_layer) {
      ags_layer.setUrl(url_template);
    } else {
      ags_layer = new L.TileLayer(url_template, {maxZoom: 21});
      map.addLayer(ags_layer);
    }
  }

  $('#update-layer').on('click', updateLayer);

  updateLayer();
}());`

    return c.text(js, 200, {'content-type': 'text/javascript'})
})

app.get('/', c => {
    const template = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="ArcGIS Server Proxy - Fetch slippy map tiles from an uncached ArcGIS Server map">
    <meta name="author" content="OpenStreetMap US">
    <title>ArcGIS Server Proxy</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin=""/>
    <link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/3.2.0/css/bootstrap.min.css">
    <link rel="stylesheet" href="app.css">
  </head>
  <body>
    <div class="wrapper">
      <div class="left">
        <h3>ArcGIS Server Proxy</h3>
        <p style="font-size:12px">
          Use ArcGIS Server map services as background layers in OpenStreetMap editors like iD and JOSM.
        <br><br>

          Hosted by <a href="https://www.openstreetmap.us">OpenStreetMap US</a><br>
          <a href="https://github.com/JasonSanford/tileify-ags-proxy">Forked with ♥</a><br>
          Code available <a href="https://github.com/osmus/tileify-ags-proxy">on Github</a>

        </p>
        <hr>
        <p style="font-size:12px">
          Paste your ArcGIS Server map service URL (ending with ..../MapServer ) below.<br><br>

          Use the URL parameters to specify service properties, like: <br><br>

          transparent | true (transparent background)<br>
          layers | show:14 (shows layer 14 in the service)<br><br>

          For all options see <a href="https://developers.arcgis.com/rest/services-reference/export-map.htm#GUID-C93E8957-99FD-473B-B0E1-68EA315EBD98">Esri Rest Service Docs.</a><br><br>

          Click <b>Update Tile Layer</b> to refresh the map.
        </p>
        <form role="form">
          <div class="form-group">
            <label for="ags_url">ArcGIS Server URL</label>
            <input type="text" class="form-control" value="https://services.arcgisonline.com/ArcGIS/rest/services/Specialty/World_Navigation_Charts/MapServer" id="ags_url">
          </div>
          <div class="form-group">
            <label>URL Parameters (key|value)</label>
            <div class="params">
              <input type="text" class="form-control param param-key" value="">
              <input type="text" class="form-control param param-value" value="">
            </div>
            <div class="params">
              <input type="text" class="form-control param param-key" value="">
              <input type="text" class="form-control param param-value" value="">
            </div>
            <div class="params">
              <input type="text" class="form-control param param-key" value="">
              <input type="text" class="form-control param param-value" value="">
            </div>
          </div>
          <div class="form-group">
            <label for="proxy_url_template">Proxy URL Template (auto-generated)</label>
            <textarea class="form-control" id="proxy_url_template"></textarea>
          </div>
          <div style="text-align: center;">
            <button type="submit" id="update-layer" class="btn btn-default">Update Tile Layer</button>
          </div>
        </form>
      </div>
      <div id="map"></div>
    </div>
    <script src="https://code.jquery.com/jquery-2.1.1.min.js"></script>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
    <script src="app.js"></script>
  </body>
</html>`

    return c.html(template)
});

export default app
