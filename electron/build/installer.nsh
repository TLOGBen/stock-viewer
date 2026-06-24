; Custom NSIS hooks for the Taiwan Trading Desk installer.
;
; On uninstall, also remove the per-user cache/data the app writes to
; %APPDATA%\<productName>\data (universe directory, watchlist, k-line cache).
; This keeps "uninstall" clean — nothing left behind after removal.

!macro customUnInstall
  ; $APPDATA here is the per-user roaming dir; productName folder = Electron userData.
  RMDir /r "$APPDATA\${PRODUCT_NAME}"
!macroend
