// Package modelos guarda os arquivos que o `ponte setup` instala como estão.
package modelos

import _ "embed"

// PluginOpenCode é o plugin global do OpenCode (escritorio-vivo.js).
//
//go:embed opencode-escritorio-vivo.js
var PluginOpenCode []byte
