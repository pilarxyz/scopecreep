Output demo/scopecreep.gif

Set Shell zsh
Set FontSize 15
Set FontFamily "Menlo"
Set Width 940
Set Height 690
Set Padding 18
Set Theme "TokyoNight"
Set TypingSpeed 35ms
Set Framerate 24

Hide
Type "export PATH=/tmp/scdemo-bin:$PATH; setopt interactivecomments; cd /tmp/scdemo-run; clear"
Enter
Sleep 1s
Show

Type "cat scopecreep.json"
Enter
Sleep 2500ms

Type "# the agent was told to work in src/auth. let it run."
Enter
Sleep 1200ms

Type "agent src/auth/login.ts src/auth/session.ts src/api/users.ts package.json"
Enter
Sleep 5500ms

Type "scopecreep undo 7f3a --oos"
Enter
Sleep 2500ms

Type "cat src/api/users.ts"
Enter
Sleep 3s
