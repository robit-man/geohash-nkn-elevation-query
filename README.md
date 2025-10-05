# Elevation Forwarder API — Routing & Requests (Concise Guide)

This forwarder lets you request elevation samples either **directly over HTTP** (OpenTopoData-style) or **via NKN DMs** (batched, chunked, correlation-ID replies). It supports **lat/lng** and **geohash** payloads.

<img width="1293" height="1473" alt="image" src="https://github.com/user-attachments/assets/5601ca64-a295-4dc3-ae68-687a115b02e2" />


---

## 1) HTTP (OpenTopoData style)

**Route**

```
GET /v1/{dataset}?locations=<pipe-separated>
```

* `dataset` — e.g. `mapzen`
* `locations` — pipe-separated `lat,lng` pairs
  Example: `57.688709,11.976404|45.343,-122.343`

**Alternative (geohash mode)**

```
GET /v1/{dataset}?geohashes=<pipe-separated>[&enc=geohash][&prec=<n>]
```

* `geohashes` — pipe-separated base-32 geohashes (length 6–10 recommended)
* `enc=geohash` — optional hint (for clarity)
* `prec` — optional integer precision (characters per hash)

**Sample (lat/lng)**

```bash
curl "http://localhost:5000/v1/mapzen?locations=57.688709,11.976404|45.343,-122.343"
```

**Sample (geohash)**

```bash
curl "http://localhost:5000/v1/mapzen?geohashes=u6g5m2wnt|c20wj5b3x&enc=geohash&prec=9"
```

**Response (both modes)**

```json
{
  "results": [
    {
      "dataset": "mapzen",
      "elevation": 55.0,
      "location": { "lat": 57.688709, "lng": 11.976404 },
      "geohash": "u6g5m2wnt"       // present when geohash mode is used
    },
    {
      "dataset": "mapzen",
      "elevation": 110.0,
      "location": { "lat": 45.343, "lng": -122.343 },
      "geohash": "c20wj5b3x"
    }
  ],
  "status": "OK"
}
```

> Notes
>
> * Order is **not guaranteed**. Match by `location` (rounded to 1e-6) or `geohash`.
> * Elevations are **meters**. Coords are **WGS84** decimal degrees.

---

## 2) NKN DM (batched; preferred for large jobs)

Send a JSON envelope to your relay’s NKN address. The forwarder performs the HTTP call and replies with a correlated message.

**Request (lat/lng)**

```json
{
  "id": "uuid-4-here",              // optional, auto-assigned if missing
  "type": "elev.query",
  "dataset": "mapzen",
  "locations": [
    { "lat": 57.688709, "lng": 11.976404 },
    { "lat": 45.343,    "lng": -122.343 }
  ]
}
```

**Request (geohash)**

```json
{
  "id": "uuid-4-here",
  "type": "elev.query",
  "dataset": "mapzen",
  "enc": "geohash",
  "prec": 9,                         // optional (server accepts mixed lengths)
  "geohashes": ["u6g5m2wnt", "c20wj5b3x"]
}
```

**Response (correlated)**

```json
{
  "type": "http.response",
  "id": "uuid-4-here",
  "status": 200,
  "duration_ms": 147,
  "body_b64": "eyJyZXN1bHRzIjpbeyJkYXRhc2V0IjoibWFwemVuIiwiZWxldmF0aW9uIjo1NS4wLCJsb2NhdGlvbiI6eyJsYXQiOjU3LjY4ODcwOSwibG5nIjoxMS45NzY0MDR9LCJnZW9oYXNoIjoidTZnNW0yd250In1dLCJzdGF0dXMiOiJPSyJ9"
}
```

Decode `body_b64` (base64) to obtain the **same JSON** you’d get from the HTTP endpoint (see above).

> Errors return the same envelope with:
>
> * `status` set to an HTTP-like code (e.g., `400`, `502`)
> * `body_b64` containing an object such as `{"error":"...","status":"ERROR"}`

---

## Payload Limits & Batching

* Typical NKN DM safe budget: **~2.5–3.0 KB JSON** per message.
  (Exact limit depends on your route; chunk aggressively.)
* Practical hard caps used by our clients:

  * **Lat/Lng**: ≤ **~350** points per DM
  * **Geohash**: ≤ **~800** hashes per DM (more compact)
* Always **chunk** large grids and **parallelize** if your client supports it.
  Map results back to your grid via `(lat,lng)` (rounded to 6 dp) or `geohash`.

---

## Progressive (Recommended) Fetch Strategy

For fast, visually pleasant refinement:

1. Build levels using stride sizes of powers of two (≤ min(nx−1, ny−1)).
   Example strides: `256, 128, 64, …, 1`.
2. Within each level, order samples by **Morton (Z-curve)** to spread coverage.
3. After each batch:

   * Apply fetched points as **anchors**.
   * Fill all unfetched vertices via **nearest-anchor propagation** (no holes).
   * Run a light **smoothing** pass (anchors fixed) for a cohesive low-res look.

This creates an immediate low-frequency surface that sharpens as data streams in.

---

## Status Codes & Errors

* `status: "OK"` (HTTP `200`) — normal success.
* `status: "ERROR"` (HTTP `4xx/5xx`) — error object in body, e.g.:

  ```json
  { "error": "only GET /v1/<dataset>?locations=... supported", "status": "ERROR" }
  ```
* Common causes:

  * Malformed query (`lat,lng` parse fail or bad geohash)
  * Unsupported dataset
  * Excessive `locations`/`geohashes` (chunk smaller)
  * Backend unavailable

---

## Field & Format Reference

* **dataset**: string (e.g., `mapzen`)
* **locations**: array of `{lat:number, lng:number}`
* **geohashes**: array of base-32 strings (length 6–10 typical)
* **enc** (DM/HTTP): `"geohash"` when geohash mode is used
* **prec** (optional): integer precision hint (characters per geohash)
* **id** (DM): correlation ID (UUID recommended)
* **elevation**: meters (float)
* **location**: `{lat,lng}` always present in responses; `geohash` present in geohash mode

---

## Examples

**HTTP (local), 3 points**

```bash
curl "http://localhost:5000/v1/mapzen?locations=45.356548,-122.597800|45.356548,-122.597727|45.356548,-122.597654"
```

**DM (geohash), batched**

```json
{
  "type": "elev.query",
  "dataset": "mapzen",
  "enc": "geohash",
  "geohashes": ["9q8yyk2e2", "9q8yyk2e8", "9q8yyk2ed"]
}
```

---

## Implementation Tips

* Round `(lat,lng)` keys to **6 decimal places** when mapping results.
* De-duplicate inputs before sending to save payload.
* If you switch modes on the fly, keep separate maps:

  * `key = lat.toFixed(6)+","+lng.toFixed(6)` for lat/lng
  * `key = geohash` for geohash
* Prefer geohash for **large grids** (smaller payloads, fewer batches).

---

That’s it — you can route via HTTP directly or DM your relay with the same semantics, choose **lat/lng** or **geohash**, and stream results progressively.
