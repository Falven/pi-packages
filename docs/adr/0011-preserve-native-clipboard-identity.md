# Preserve native clipboard identity

Native clipboard actions classify copied files and images through Pi's clipboard metadata, with file identity taking precedence over image data, so attachments capture the content the user copied. Terminal and extension text pastes follow the text policy without reading a named file or borrowing identity from the current clipboard, so a path copied as text remains text. Metadata-aware paste uses Pi's configured clipboard action and existing extension handlers.
