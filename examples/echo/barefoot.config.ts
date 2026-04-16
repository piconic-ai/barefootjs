import { createConfig } from '@barefootjs/go-template/build'

export default createConfig({
  components: ['../shared/components'],
  outDir: 'dist',
  minify: true,
  adapterOptions: { packageName: 'main' },
  typesOutputFile: 'components.go',
  manualTypes: `// =============================================================================
// Manual Types (application-specific, not generated from components)
// =============================================================================

// Todo represents a single todo item.
type Todo struct {
\tID      int    \`json:"id"\`
\tText    string \`json:"text"\`
\tDone    bool   \`json:"done"\`
\tEditing bool   \`json:"editing"\`
}`,
  transformTypes: (types) => {
    let t = types

    // 1. Fix TodoItemInput: Todo interface{} -> Todo Todo
    t = t.replace(
      /(\tTodo) interface\{\}(\n)/g,
      '$1 Todo$2'
    )

    // 2. Fix TodoItemProps: Todo interface{} `json:"todo"` -> Todo Todo `json:"todo"`
    t = t.replace(
      /(\tTodo) interface\{\} (`json:"todo"`)/g,
      '$1 Todo $2'
    )

    // 3. Fix TodoAppInput: InitialTodos interface{} -> InitialTodos []Todo
    t = t.replace(
      /(InitialTodos) \[\]interface\{\}(\n)/g,
      '$1 []Todo$2'
    )

    // 4. Fix TodoAppProps: InitialTodos []interface{} `json:...` -> InitialTodos []Todo `json:...`
    t = t.replace(
      /(InitialTodos) \[\]interface\{\} (`json:"initialTodos"`)/g,
      '$1 []Todo $2'
    )

    // 5. Fix TodoAppProps: Todos []interface{} -> Todos []Todo
    t = t.replace(
      /(\tTodos) \[\]interface\{\} (`json:"todos"`)/g,
      '$1 []Todo $2'
    )

    // 6. Add extra fields to TodoAppProps (before closing brace)
    t = t.replace(
      /(type TodoAppProps struct \{[\s\S]*?)(^\})/m,
      `$1\tTodoItems    []TodoItemProps  \`json:"-"\`         // For Go template (not in JSON)
\tDoneCount    int              \`json:"doneCount"\` // Pre-computed done count
$2`
    )

    // 7. Fix TodoAppSSRProps and TodoAppProps: Filter interface{} -> Filter string
    t = t.replace(
      /(Filter) interface\{\} (`json:"filter"`)/g,
      '$1 string $2'
    )

    // 7b. Fix Filter initial value: nil -> ""
    t = t.replace(
      /Filter: nil,/g,
      'Filter: "all",'
    )

    // 8. Add extra fields to TodoAppSSRProps (before closing brace)
    t = t.replace(
      /(type TodoAppSSRProps struct \{[\s\S]*?)(^\})/m,
      `$1\tTodoItems    []TodoItemProps  \`json:"-"\`         // For Go template (not in JSON)
\tDoneCount    int              \`json:"doneCount"\` // Pre-computed done count
$2`
    )

    // 9. Fix DestructuredStyleChildInput: Value and Label should be int/string
    t = t.replace(
      /type DestructuredStyleChildInput struct \{[\s\S]*?Value interface\{\}[\s\S]*?Label interface\{\}[\s\S]*?\}/,
      `type DestructuredStyleChildInput struct {
\tScopeID string // Optional: if empty, random ID is generated
\tValue int
\tLabel string
}`
    )

    // 10. Fix DestructuredStyleChildProps: Value and Label types
    t = t.replace(
      /(type DestructuredStyleChildProps struct \{[\s\S]*?)Value interface\{\} (`json:"value"`)[\s\S]*?Label interface\{\} (`json:"label"`)/,
      '$1Value int $2\n\tLabel string $3'
    )

    return t
  },
})
