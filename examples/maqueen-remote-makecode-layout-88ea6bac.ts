/**
 * Example layout exported by Micro:bit Remote Builder v2.1
 * Revision: 88ea6bac
 * Canvas: 1372 x 776
 *
 * Replace only the existing CFG and CFG_REV constants in v51+ firmware.
 */

// Human-readable reference:
// {
//   "title": "Maqueen Remote",
//   "widgets": [
//     {
//       "id": "slider_srv1",
//       "t": "slider",
//       "x": 57,
//       "y": 28,
//       "w": 99,
//       "h": 203,
//       "label": "Servo 1",
//       "min": 0,
//       "max": 180,
//       "step": 1,
//       "value": 90
//     },
//     {
//       "id": "slider_srv2",
//       "t": "slider",
//       "x": 233,
//       "y": 30,
//       "w": 99,
//       "h": 201,
//       "label": "Servo 2",
//       "min": 0,
//       "max": 180,
//       "step": 1,
//       "value": 90
//     },
//     {
//       "id": "dpad_move",
//       "t": "dpad",
//       "x": 404,
//       "y": 27,
//       "w": 449,
//       "h": 456,
//       "label": "Drive",
//       "model": "classic"
//     },
//     {
//       "id": "spd",
//       "t": "slider",
//       "x": 410,
//       "y": 493,
//       "w": 148,
//       "h": 262,
//       "label": "Speed",
//       "min": 60,
//       "max": 255,
//       "step": 5,
//       "value": 200
//     },
//     {
//       "id": "gauge_srv1",
//       "t": "gauge",
//       "x": 16,
//       "y": 231,
//       "w": 164,
//       "h": 185,
//       "label": "Servo 1",
//       "min": 0,
//       "max": 180,
//       "units": "°",
//       "decimals": 0,
//       "model": "min",
//       "source": "slider_srv1",
//       "value": 90
//     },
//     {
//       "id": "gauge_srv2",
//       "t": "gauge",
//       "x": 194,
//       "y": 235,
//       "w": 173,
//       "h": 181,
//       "label": "Servo 2",
//       "min": 0,
//       "max": 180,
//       "units": "°",
//       "decimals": 0,
//       "model": "min",
//       "source": "slider_srv2",
//       "value": 90
//     },
//     {
//       "id": "gauge_spd",
//       "t": "gauge",
//       "x": 620,
//       "y": 501,
//       "w": 229,
//       "h": 252,
//       "label": "Speed",
//       "min": 60,
//       "max": 255,
//       "units": "",
//       "decimals": 0,
//       "model": "min",
//       "source": "spd",
//       "value": 200
//     },
//     {
//       "id": "mode",
//       "t": "select",
//       "x": 1080,
//       "y": 119,
//       "w": 179,
//       "h": 92,
//       "label": "Mode",
//       "options": "Manual,Line,Avoid"
//     },
//     {
//       "id": "btn_stop",
//       "t": "button",
//       "x": 261,
//       "y": 586,
//       "w": 107,
//       "h": 115,
//       "label": "STOP"
//     },
//     {
//       "id": "btn_buzz",
//       "t": "button",
//       "x": 260,
//       "y": 449,
//       "w": 108,
//       "h": 121,
//       "label": "Buzz"
//     },
//     {
//       "id": "upd",
//       "t": "select",
//       "x": 886,
//       "y": 116,
//       "w": 182,
//       "h": 94,
//       "label": "Telemetry",
//       "options": "All,Basic,Off"
//     },
//     {
//       "id": "lbl_heartbeat",
//       "t": "label",
//       "x": 1021,
//       "y": 29,
//       "w": 237,
//       "h": 76,
//       "label": "Uptime"
//     },
//     {
//       "id": "lbl_ver",
//       "t": "label",
//       "x": 887,
//       "y": 27,
//       "w": 109,
//       "h": 79,
//       "label": "Firmware"
//     },
//     {
//       "id": "toggle_led_l",
//       "t": "toggle",
//       "x": 22,
//       "y": 449,
//       "w": 97,
//       "h": 121,
//       "label": "LED L"
//     },
//     {
//       "id": "toggle_led_r",
//       "t": "toggle",
//       "x": 143,
//       "y": 449,
//       "w": 97,
//       "h": 121,
//       "label": "LED R"
//     },
//     {
//       "id": "ln_l",
//       "t": "led",
//       "x": 25,
//       "y": 586,
//       "w": 76,
//       "h": 105,
//       "label": "Line L",
//       "model": "dot",
//       "colorOn": "#4ade80"
//     },
//     {
//       "id": "ln_r",
//       "t": "led",
//       "x": 153,
//       "y": 586,
//       "w": 78,
//       "h": 105,
//       "label": "Line R",
//       "model": "dot",
//       "colorOn": "#4ade80"
//     },
//     {
//       "id": "alert",
//       "t": "notification",
//       "x": 1263,
//       "y": 27,
//       "w": 90,
//       "h": 186,
//       "label": "Alert"
//     },
//     {
//       "id": "dist_read",
//       "t": "select",
//       "x": 877,
//       "y": 336,
//       "w": 194,
//       "h": 62,
//       "label": "Distance read",
//       "options": "Auto,Read now"
//     },
//     {
//       "id": "gauge_dist",
//       "t": "gauge",
//       "x": 1087,
//       "y": 263,
//       "w": 264,
//       "h": 187,
//       "label": "Distance",
//       "min": 0,
//       "max": 200,
//       "units": "cm",
//       "decimals": 0,
//       "model": "classic"
//     },
//     {
//       "id": "graph_dist",
//       "t": "graph",
//       "x": 866,
//       "y": 459,
//       "w": 481,
//       "h": 298,
//       "label": "Distance cm",
//       "model": "grid",
//       "windowSec": 30,
//       "series": 1
//     }
//   ],
//   "canvas": {
//     "w": 1372,
//     "h": 776
//   }
// }

const CFG = "eyJ0aXRsZSI6Ik1hcXVlZW4gUmVtb3RlIiwid2lkZ2V0cyI6W3siaWQiOiJzbGlkZXJfc3J2MSIsInQiOiJzbGlkZXIiLCJ4Ijo1NywieSI6MjgsInciOjk5LCJoIjoyMDMsImxhYmVsIjoiU2Vydm8gMSIsIm1pbiI6MCwibWF4IjoxODAsInN0ZXAiOjEsInZhbHVlIjo5MH0seyJpZCI6InNsaWRlcl9zcnYyIiwidCI6InNsaWRlciIsIngiOjIzMywieSI6MzAsInciOjk5LCJoIjoyMDEsImxhYmVsIjoiU2Vydm8gMiIsIm1pbiI6MCwibWF4IjoxODAsInN0ZXAiOjEsInZhbHVlIjo5MH0seyJpZCI6ImRwYWRfbW92ZSIsInQiOiJkcGFkIiwieCI6NDA0LCJ5IjoyNywidyI6NDQ5LCJoIjo0NTYsImxhYmVsIjoiRHJpdmUiLCJtb2RlbCI6ImNsYXNzaWMifSx7ImlkIjoic3BkIiwidCI6InNsaWRlciIsIngiOjQxMCwieSI6NDkzLCJ3IjoxNDgsImgiOjI2MiwibGFiZWwiOiJTcGVlZCIsIm1pbiI6NjAsIm1heCI6MjU1LCJzdGVwIjo1LCJ2YWx1ZSI6MjAwfSx7ImlkIjoiZ2F1Z2Vfc3J2MSIsInQiOiJnYXVnZSIsIngiOjE2LCJ5IjoyMzEsInciOjE2NCwiaCI6MTg1LCJsYWJlbCI6IlNlcnZvIDEiLCJtaW4iOjAsIm1heCI6MTgwLCJ1bml0cyI6IsKwIiwiZGVjaW1hbHMiOjAsIm1vZGVsIjoibWluIiwic291cmNlIjoic2xpZGVyX3NydjEiLCJ2YWx1ZSI6OTB9LHsiaWQiOiJnYXVnZV9zcnYyIiwidCI6ImdhdWdlIiwieCI6MTk0LCJ5IjoyMzUsInciOjE3MywiaCI6MTgxLCJsYWJlbCI6IlNlcnZvIDIiLCJtaW4iOjAsIm1heCI6MTgwLCJ1bml0cyI6IsKwIiwiZGVjaW1hbHMiOjAsIm1vZGVsIjoibWluIiwic291cmNlIjoic2xpZGVyX3NydjIiLCJ2YWx1ZSI6OTB9LHsiaWQiOiJnYXVnZV9zcGQiLCJ0IjoiZ2F1Z2UiLCJ4Ijo2MjAsInkiOjUwMSwidyI6MjI5LCJoIjoyNTIsImxhYmVsIjoiU3BlZWQiLCJtaW4iOjYwLCJtYXgiOjI1NSwidW5pdHMiOiIiLCJkZWNpbWFscyI6MCwibW9kZWwiOiJtaW4iLCJzb3VyY2UiOiJzcGQiLCJ2YWx1ZSI6MjAwfSx7ImlkIjoibW9kZSIsInQiOiJzZWxlY3QiLCJ4IjoxMDgwLCJ5IjoxMTksInciOjE3OSwiaCI6OTIsImxhYmVsIjoiTW9kZSIsIm9wdGlvbnMiOiJNYW51YWwsTGluZSxBdm9pZCJ9LHsiaWQiOiJidG5fc3RvcCIsInQiOiJidXR0b24iLCJ4IjoyNjEsInkiOjU4NiwidyI6MTA3LCJoIjoxMTUsImxhYmVsIjoiU1RPUCJ9LHsiaWQiOiJidG5fYnV6eiIsInQiOiJidXR0b24iLCJ4IjoyNjAsInkiOjQ0OSwidyI6MTA4LCJoIjoxMjEsImxhYmVsIjoiQnV6eiJ9LHsiaWQiOiJ1cGQiLCJ0Ijoic2VsZWN0IiwieCI6ODg2LCJ5IjoxMTYsInciOjE4MiwiaCI6OTQsImxhYmVsIjoiVGVsZW1ldHJ5Iiwib3B0aW9ucyI6IkFsbCxCYXNpYyxPZmYifSx7ImlkIjoibGJsX2hlYXJ0YmVhdCIsInQiOiJsYWJlbCIsIngiOjEwMjEsInkiOjI5LCJ3IjoyMzcsImgiOjc2LCJsYWJlbCI6IlVwdGltZSJ9LHsiaWQiOiJsYmxfdmVyIiwidCI6ImxhYmVsIiwieCI6ODg3LCJ5IjoyNywidyI6MTA5LCJoIjo3OSwibGFiZWwiOiJGaXJtd2FyZSJ9LHsiaWQiOiJ0b2dnbGVfbGVkX2wiLCJ0IjoidG9nZ2xlIiwieCI6MjIsInkiOjQ0OSwidyI6OTcsImgiOjEyMSwibGFiZWwiOiJMRUQgTCJ9LHsiaWQiOiJ0b2dnbGVfbGVkX3IiLCJ0IjoidG9nZ2xlIiwieCI6MTQzLCJ5Ijo0NDksInciOjk3LCJoIjoxMjEsImxhYmVsIjoiTEVEIFIifSx7ImlkIjoibG5fbCIsInQiOiJsZWQiLCJ4IjoyNSwieSI6NTg2LCJ3Ijo3NiwiaCI6MTA1LCJsYWJlbCI6IkxpbmUgTCIsIm1vZGVsIjoiZG90IiwiY29sb3JPbiI6IiM0YWRlODAifSx7ImlkIjoibG5fciIsInQiOiJsZWQiLCJ4IjoxNTMsInkiOjU4NiwidyI6NzgsImgiOjEwNSwibGFiZWwiOiJMaW5lIFIiLCJtb2RlbCI6ImRvdCIsImNvbG9yT24iOiIjNGFkZTgwIn0seyJpZCI6ImFsZXJ0IiwidCI6Im5vdGlmaWNhdGlvbiIsIngiOjEyNjMsInkiOjI3LCJ3Ijo5MCwiaCI6MTg2LCJsYWJlbCI6IkFsZXJ0In0seyJpZCI6ImRpc3RfcmVhZCIsInQiOiJzZWxlY3QiLCJ4Ijo4NzcsInkiOjMzNiwidyI6MTk0LCJoIjo2MiwibGFiZWwiOiJEaXN0YW5jZSByZWFkIiwib3B0aW9ucyI6IkF1dG8sUmVhZCBub3cifSx7ImlkIjoiZ2F1Z2VfZGlzdCIsInQiOiJnYXVnZSIsIngiOjEwODcsInkiOjI2MywidyI6MjY0LCJoIjoxODcsImxhYmVsIjoiRGlzdGFuY2UiLCJtaW4iOjAsIm1heCI6MjAwLCJ1bml0cyI6ImNtIiwiZGVjaW1hbHMiOjAsIm1vZGVsIjoiY2xhc3NpYyJ9LHsiaWQiOiJncmFwaF9kaXN0IiwidCI6ImdyYXBoIiwieCI6ODY2LCJ5Ijo0NTksInciOjQ4MSwiaCI6Mjk4LCJsYWJlbCI6IkRpc3RhbmNlIGNtIiwibW9kZWwiOiJncmlkIiwid2luZG93U2VjIjozMCwic2VyaWVzIjoxfV0sImNhbnZhcyI6eyJ3IjoxMzcyLCJoIjo3NzZ9fQ=="
const CFG_REV = "88ea6bac"
