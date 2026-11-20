//go:build windows

package maestri

import "os"

// acharSocket no Windows: só o MAESTRI_SOCKET da própria ponte (a ponte iniciada num terminal
// do Maestri). Sem ele, a ponte não digita nos terminais (ainda não se sabe onde o app o põe).
func acharSocket() string {
	return os.Getenv("MAESTRI_SOCKET")
}
