// Package bf provides runtime helper functions for BarefootJS Go templates.
// These functions mirror JavaScript behavior for consistent SSR output.
package bf

import (
	"bytes"
	"encoding/json"
	"html/template"
	"reflect"
	"sort"
	"strconv"
	"strings"
)

// FuncMap returns a template.FuncMap with all BarefootJS helper functions.
// Usage:
//
//	tmpl := template.New("").Funcs(bf.FuncMap())
func FuncMap() template.FuncMap {
	return template.FuncMap{
		// Arithmetic
		"bf_add": Add,
		"bf_sub": Sub,
		"bf_mul": Mul,
		"bf_div": Div,
		"bf_mod": Mod,
		"bf_neg": Neg,

		// String
		"bf_lower":    Lower,
		"bf_upper":    Upper,
		"bf_trim":     Trim,
		"bf_contains": Contains,
		"bf_join":     Join,

		// Array/Slice
		"bf_len":      Len,
		"bf_at":       At,
		"bf_includes": Includes,
		"bf_first":    First,
		"bf_last":     Last,

		// Higher-order Array Methods
		"bf_every":      Every,
		"bf_some":       Some,
		"bf_filter":     Filter,
		"bf_find":       Find,
		"bf_find_index": FindIndex,
		"bf_sort":       Sort,

		// Comment marker (for hydration)
		"bfComment":    Comment,
		"bfTextStart":  TextStart,
		"bfTextEnd":    TextEnd,

		// Script collection
		"bfScripts": BfScripts,

		// Scope attribute value (prepends ~ for child components)
		"bfScopeAttr": ScopeAttr,

		// Child component marker (kept for backward compatibility)
		"bfIsChild": IsChild,

		// Props attribute for hydration
		"bfPropsAttr": BfPropsAttr,

		// Portal HTML rendering (parses and executes template string)
		"bfPortalHTML": PortalHTML,

		// Scope comment for fragment roots
		"bfScopeComment": ScopeComment,
	}
}

// ScopeAttr returns the scope attribute value for bf-s.
// Returns "~scopeID" for child components (prefixed with ~) and "scopeID" for root components.
// Checks the BfIsChild field set by Render(), with fallback to scopeID "_sN" pattern.
func ScopeAttr(props interface{}) string {
	scopeID := getStringField(props, "ScopeID")
	if getBoolField(props, "BfIsChild") {
		return "~" + scopeID
	}
	// Fallback: check scopeID pattern for single child slots (e.g., "Parent_abc123_s4")
	for i := 0; i < len(scopeID)-2; i++ {
		if scopeID[i] == '_' && scopeID[i+1] == 's' && scopeID[i+2] >= '0' && scopeID[i+2] <= '9' {
			return "~" + scopeID
		}
	}
	return scopeID
}

// IsChild returns empty string. Child status is now merged into bf-s attribute value via ~ prefix.
// Deprecated: Use ScopeAttr instead, which merges child status into the bf-s attribute value.
func IsChild(props interface{}) template.HTMLAttr {
	return ""
}

// BfPropsAttr returns a bf-p attribute with the JSON-serialized props in flat format.
// Output format: bf-p='{"propName": value, ...}'
// Only emits the attribute for root components (BfIsRoot == true).
// Child components receive props from their parent via initChild().
func BfPropsAttr(props interface{}) template.HTMLAttr {
	// Only root components should emit bf-p
	if !getBoolField(props, "BfIsRoot") {
		return ""
	}

	propsJSON, err := json.Marshal(props)
	if err != nil {
		return ""
	}

	escaped := template.HTMLEscapeString(string(propsJSON))
	return template.HTMLAttr(`bf-p="` + escaped + `"`)
}

// =============================================================================
// Arithmetic Operations
// =============================================================================

// Add returns a + b. Supports int and float64.
func Add(a, b any) any {
	av, bv := toFloat64(a), toFloat64(b)
	result := av + bv
	// Return int if both inputs were int-like
	if isIntLike(a) && isIntLike(b) && result == float64(int(result)) {
		return int(result)
	}
	return result
}

// Sub returns a - b. Supports int and float64.
func Sub(a, b any) any {
	av, bv := toFloat64(a), toFloat64(b)
	result := av - bv
	if isIntLike(a) && isIntLike(b) && result == float64(int(result)) {
		return int(result)
	}
	return result
}

// Mul returns a * b. Supports int and float64.
func Mul(a, b any) any {
	av, bv := toFloat64(a), toFloat64(b)
	result := av * bv
	if isIntLike(a) && isIntLike(b) && result == float64(int(result)) {
		return int(result)
	}
	return result
}

// Div returns a / b. Returns float64 to match JavaScript behavior.
// Returns 0 if b is 0 (instead of panicking).
func Div(a, b any) any {
	av, bv := toFloat64(a), toFloat64(b)
	if bv == 0 {
		return 0
	}
	return av / bv
}

// Mod returns a % b (modulo). Supports int only.
func Mod(a, b any) int {
	av, bv := toInt(a), toInt(b)
	if bv == 0 {
		return 0
	}
	return av % bv
}

// Neg returns -a (negation).
func Neg(a any) any {
	if v, ok := a.(int); ok {
		return -v
	}
	return -toFloat64(a)
}

// =============================================================================
// String Operations
// =============================================================================

// Lower returns the lowercase version of s.
func Lower(s string) string {
	return strings.ToLower(s)
}

// Upper returns the uppercase version of s.
func Upper(s string) string {
	return strings.ToUpper(s)
}

// Trim returns s with leading and trailing whitespace removed.
func Trim(s string) string {
	return strings.TrimSpace(s)
}

// Contains returns true if s contains substr.
func Contains(s, substr string) bool {
	return strings.Contains(s, substr)
}

// Join concatenates elements of a slice with sep.
func Join(items any, sep string) string {
	v := reflect.ValueOf(items)
	if v.Kind() != reflect.Slice {
		return ""
	}

	parts := make([]string, v.Len())
	for i := 0; i < v.Len(); i++ {
		parts[i] = toString(v.Index(i).Interface())
	}
	return strings.Join(parts, sep)
}

// =============================================================================
// Array/Slice Operations
// =============================================================================

// Len returns the length of a slice, array, map, string, or channel.
// Returns 0 for nil or unsupported types.
func Len(v any) int {
	if v == nil {
		return 0
	}
	rv := reflect.ValueOf(v)
	switch rv.Kind() {
	case reflect.Slice, reflect.Array, reflect.Map, reflect.String, reflect.Chan:
		return rv.Len()
	default:
		return 0
	}
}

// At returns the element at index i from a slice.
// Supports negative indices (e.g., -1 for last element).
// Returns nil if index is out of bounds.
func At(items any, index int) any {
	v := reflect.ValueOf(items)
	if v.Kind() != reflect.Slice && v.Kind() != reflect.Array {
		return nil
	}

	length := v.Len()
	if length == 0 {
		return nil
	}

	// Handle negative indices
	if index < 0 {
		index = length + index
	}

	if index < 0 || index >= length {
		return nil
	}

	return v.Index(index).Interface()
}

// Includes returns true if items contains elem.
// Uses reflect.DeepEqual for comparison.
func Includes(items any, elem any) bool {
	v := reflect.ValueOf(items)
	if v.Kind() != reflect.Slice && v.Kind() != reflect.Array {
		return false
	}

	for i := 0; i < v.Len(); i++ {
		if reflect.DeepEqual(v.Index(i).Interface(), elem) {
			return true
		}
	}
	return false
}

// First returns the first element of a slice, or nil if empty.
func First(items any) any {
	return At(items, 0)
}

// Last returns the last element of a slice, or nil if empty.
func Last(items any) any {
	return At(items, -1)
}

// =============================================================================
// Higher-order Array Methods
// =============================================================================

// Every returns true if all items have the specified field set to true.
// Mirrors JavaScript's Array.prototype.every(item => item.field).
func Every(items any, field string) bool {
	v := reflect.ValueOf(items)
	if v.Kind() != reflect.Slice && v.Kind() != reflect.Array {
		return false
	}

	capitalizedField := capitalize(field)
	for i := 0; i < v.Len(); i++ {
		item := v.Index(i)
		if item.Kind() == reflect.Interface {
			item = item.Elem()
		}
		if item.Kind() == reflect.Ptr {
			item = item.Elem()
		}
		if item.Kind() != reflect.Struct {
			continue
		}

		fieldVal := item.FieldByName(capitalizedField)
		if !fieldVal.IsValid() {
			return false
		}
		if fieldVal.Kind() == reflect.Bool && !fieldVal.Bool() {
			return false
		}
	}
	return true
}

// Some returns true if at least one item has the specified field set to true.
// Mirrors JavaScript's Array.prototype.some(item => item.field).
func Some(items any, field string) bool {
	v := reflect.ValueOf(items)
	if v.Kind() != reflect.Slice && v.Kind() != reflect.Array {
		return false
	}

	capitalizedField := capitalize(field)
	for i := 0; i < v.Len(); i++ {
		item := v.Index(i)
		if item.Kind() == reflect.Interface {
			item = item.Elem()
		}
		if item.Kind() == reflect.Ptr {
			item = item.Elem()
		}
		if item.Kind() != reflect.Struct {
			continue
		}

		fieldVal := item.FieldByName(capitalizedField)
		if fieldVal.IsValid() && fieldVal.Kind() == reflect.Bool && fieldVal.Bool() {
			return true
		}
	}
	return false
}

// Filter returns items where item.field == value.
// Mirrors JavaScript's Array.prototype.filter(item => item.field === value).
// Returns []any to allow chaining with other bf_* functions.
func Filter(items any, field string, value any) []any {
	v := reflect.ValueOf(items)
	if v.Kind() != reflect.Slice && v.Kind() != reflect.Array {
		return nil
	}

	capitalizedField := capitalize(field)
	var result []any

	for i := 0; i < v.Len(); i++ {
		item := v.Index(i)
		if item.Kind() == reflect.Interface {
			item = item.Elem()
		}
		if item.Kind() == reflect.Ptr {
			item = item.Elem()
		}
		if item.Kind() != reflect.Struct {
			continue
		}

		fieldVal := item.FieldByName(capitalizedField)
		if !fieldVal.IsValid() {
			continue
		}

		// Compare field value with target value
		if reflect.DeepEqual(fieldVal.Interface(), value) {
			result = append(result, v.Index(i).Interface())
		}
	}
	return result
}

// Find returns the first item where item.field == value, or nil if not found.
// Mirrors JavaScript's Array.prototype.find(item => item.field === value).
func Find(items any, field string, value any) any {
	v := reflect.ValueOf(items)
	if v.Kind() != reflect.Slice && v.Kind() != reflect.Array {
		return nil
	}

	capitalizedField := capitalize(field)
	for i := 0; i < v.Len(); i++ {
		item := v.Index(i)
		if item.Kind() == reflect.Interface {
			item = item.Elem()
		}
		if item.Kind() == reflect.Ptr {
			item = item.Elem()
		}
		if item.Kind() != reflect.Struct {
			continue
		}

		fieldVal := item.FieldByName(capitalizedField)
		if !fieldVal.IsValid() {
			continue
		}

		if reflect.DeepEqual(fieldVal.Interface(), value) {
			return v.Index(i).Interface()
		}
	}
	return nil
}

// FindIndex returns the index of the first item where item.field == value, or -1.
// Mirrors JavaScript's Array.prototype.findIndex(item => item.field === value).
func FindIndex(items any, field string, value any) int {
	v := reflect.ValueOf(items)
	if v.Kind() != reflect.Slice && v.Kind() != reflect.Array {
		return -1
	}

	capitalizedField := capitalize(field)
	for i := 0; i < v.Len(); i++ {
		item := v.Index(i)
		if item.Kind() == reflect.Interface {
			item = item.Elem()
		}
		if item.Kind() == reflect.Ptr {
			item = item.Elem()
		}
		if item.Kind() != reflect.Struct {
			continue
		}

		fieldVal := item.FieldByName(capitalizedField)
		if !fieldVal.IsValid() {
			continue
		}

		if reflect.DeepEqual(fieldVal.Interface(), value) {
			return i
		}
	}
	return -1
}

// Sort returns a new slice sorted by the specified field in the given direction.
// Direction must be "asc" or "desc". Uses stable sort to preserve relative order
// of equal elements.
// Mirrors JavaScript's Array.prototype.toSorted((a, b) => a.field - b.field).
func Sort(items any, field string, direction string) []any {
	v := reflect.ValueOf(items)
	if v.Kind() != reflect.Slice && v.Kind() != reflect.Array {
		return nil
	}

	length := v.Len()
	if length == 0 {
		return []any{}
	}

	// Copy items into a new slice (non-mutating, like toSorted)
	result := make([]any, length)
	for i := 0; i < length; i++ {
		result[i] = v.Index(i).Interface()
	}

	capitalizedField := capitalize(field)

	sort.SliceStable(result, func(i, j int) bool {
		vi := getFieldValue(result[i], capitalizedField)
		vj := getFieldValue(result[j], capitalizedField)

		if direction == "desc" {
			return toFloat64(vi) > toFloat64(vj)
		}
		return toFloat64(vi) < toFloat64(vj)
	})

	return result
}

// getFieldValue extracts a struct field value using reflection.
func getFieldValue(item any, field string) any {
	v := reflect.ValueOf(item)
	if v.Kind() == reflect.Interface {
		v = v.Elem()
	}
	if v.Kind() == reflect.Ptr {
		v = v.Elem()
	}
	if v.Kind() != reflect.Struct {
		return nil
	}

	fieldVal := v.FieldByName(field)
	if !fieldVal.IsValid() {
		return nil
	}
	return fieldVal.Interface()
}

// capitalize uppercases the first character of a string.
func capitalize(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

// =============================================================================
// HTML/Template Helpers
// =============================================================================

// Comment returns an HTML comment string for hydration markers.
// The "bf-" prefix is automatically added.
func Comment(content string) template.HTML {
	return template.HTML("<!--bf-" + content + "-->")
}

// TextStart returns an HTML comment start marker for reactive text expressions.
// Format: <!--bf:slotId-->
func TextStart(slotId string) template.HTML {
	return template.HTML("<!--bf:" + slotId + "-->")
}

// TextEnd returns an HTML comment end marker for reactive text expressions.
// Format: <!--/-->
func TextEnd() template.HTML {
	return "<!--/-->"
}

// ScopeComment outputs a comment-based scope marker for fragment root components.
// Format: <!--bf-scope:ScopeID--> or <!--bf-scope:~ScopeID|PropsJSON-->
// Uses the same logic as ScopeAttr for child prefix and BfPropsAttr for props.
func ScopeComment(props interface{}) template.HTML {
	scopeAttr := ScopeAttr(props)
	propsJSON := ""
	if getBoolField(props, "BfIsRoot") {
		// Build flat props JSON (same as BfPropsAttr but without the attribute wrapper)
		pJSON, err := json.Marshal(props)
		if err == nil {
			propsJSON = "|" + string(pJSON)
		}
	}
	return template.HTML("<!--bf-scope:" + scopeAttr + propsJSON + "-->")
}

// PortalHTML parses and executes a template string with the provided data.
// Used for rendering dynamic portal content where the template string
// contains Go template expressions (e.g., {{if .Open}}open{{end}}).
//
// The template string is parsed fresh each time to support dynamic content.
// Standard Go template functions (if, range, eq, etc.) are available.
func PortalHTML(data interface{}, tmplStr string) template.HTML {
	// Create a new template with the FuncMap for custom functions
	t, err := template.New("portal").Funcs(FuncMap()).Parse(tmplStr)
	if err != nil {
		// Return error message as HTML comment for debugging
		return template.HTML("<!-- bfPortalHTML error: " + err.Error() + " -->")
	}

	var buf bytes.Buffer
	if err := t.Execute(&buf, data); err != nil {
		return template.HTML("<!-- bfPortalHTML exec error: " + err.Error() + " -->")
	}

	return template.HTML(buf.String())
}

// =============================================================================
// Portal Collection
// =============================================================================

// PortalContent represents a single portal's content to be rendered at body end.
type PortalContent struct {
	ID      string        // Unique portal ID for hydration matching
	OwnerID string        // Owner scope ID for find() support
	Content template.HTML // Portal HTML content
}

// PortalCollector collects portal content during template rendering.
// Portal content is rendered at </body> to avoid z-index issues.
type PortalCollector struct {
	portals []PortalContent
	counter int
}

// NewPortalCollector creates a new PortalCollector.
func NewPortalCollector() *PortalCollector {
	return &PortalCollector{
		portals: []PortalContent{},
		counter: 0,
	}
}

// Add registers portal content to be rendered at body end.
func (pc *PortalCollector) Add(ownerID string, content template.HTML) string {
	pc.counter++
	id := "bf-portal-" + strconv.Itoa(pc.counter)
	pc.portals = append(pc.portals, PortalContent{
		ID:      id,
		OwnerID: ownerID,
		Content: content,
	})
	return "" // Return empty string for template use
}

// Render outputs all collected portals as HTML.
// Each portal is wrapped in a div with bf-pi (portal ID) and bf-po (portal owner).
func (pc *PortalCollector) Render() template.HTML {
	if pc == nil || len(pc.portals) == 0 {
		return ""
	}
	var buf strings.Builder
	for _, p := range pc.portals {
		buf.WriteString(`<div bf-pi="`)
		buf.WriteString(p.ID)
		buf.WriteString(`" bf-po="`)
		buf.WriteString(p.OwnerID)
		buf.WriteString(`">`)
		buf.WriteString(string(p.Content))
		buf.WriteString("</div>\n")
	}
	return template.HTML(buf.String())
}

// =============================================================================
// Script Collection
// =============================================================================

// ScriptCollector collects client scripts with deduplication.
// It preserves insertion order for deterministic output.
type ScriptCollector struct {
	scripts map[string]bool
	order   []string
}

// NewScriptCollector creates a new ScriptCollector.
func NewScriptCollector() *ScriptCollector {
	return &ScriptCollector{
		scripts: make(map[string]bool),
		order:   []string{},
	}
}

// Register adds a script source to the collection.
// Duplicate scripts are ignored (only first registration counts).
func (sc *ScriptCollector) Register(src string) string {
	if sc.scripts[src] {
		return "" // Already registered
	}
	sc.scripts[src] = true
	sc.order = append(sc.order, src)
	return "" // Return empty string for template use
}

// Scripts returns all registered scripts in insertion order.
func (sc *ScriptCollector) Scripts() []string {
	return sc.order
}

// BfScripts generates script tags for all registered scripts.
// Returns HTML safe for embedding in templates.
func BfScripts(collector *ScriptCollector) template.HTML {
	if collector == nil {
		return ""
	}
	var result strings.Builder
	for _, src := range collector.Scripts() {
		result.WriteString(`<script type="module" src="`)
		result.WriteString(src)
		result.WriteString(`"></script>`)
		result.WriteString("\n")
	}
	return template.HTML(result.String())
}

// =============================================================================
// Component Renderer
// =============================================================================

// RenderContext contains all data needed to render a component page.
// The layout function receives this context to build the final HTML.
type RenderContext struct {
	// ComponentName is the template name being rendered
	ComponentName string

	// Props is the component props (for layout to access if needed)
	Props interface{}

	// ComponentHTML is the rendered component template output
	ComponentHTML template.HTML

	// Portals contains collected portal content to render at body end
	Portals template.HTML

	// Scripts contains the collected JS script tags
	Scripts template.HTML

	// Title is the page title (defaults to "{ComponentName} - BarefootJS")
	Title string

	// Heading is the page heading. Empty string means no heading.
	Heading string

	// Extra holds additional user-defined data for the layout
	Extra map[string]interface{}
}

// LayoutFunc renders the final HTML page given the render context.
type LayoutFunc func(ctx *RenderContext) string

// Renderer renders BarefootJS components with a customizable layout.
type Renderer struct {
	templates *template.Template
	layout    LayoutFunc
}

// NewRenderer creates a Renderer with the given templates and layout function.
//
// Example usage:
//
//	renderer := bf.NewRenderer(templates, func(ctx *bf.RenderContext) string {
//	    return fmt.Sprintf(`<!DOCTYPE html>
//	<html>
//	<head><title>%s</title></head>
//	<body>%s%s</body>
//	</html>`, ctx.Title, ctx.ComponentHTML, ctx.Scripts)
//	})
func NewRenderer(tmpl *template.Template, layout LayoutFunc) *Renderer {
	return &Renderer{
		templates: tmpl,
		layout:    layout,
	}
}

// RenderOptions configures a single render call.
type RenderOptions struct {
	// ComponentName is the template name to render (required)
	ComponentName string

	// Props is the component props (must be a pointer to struct with Scripts field)
	Props interface{}

	// Title is the page title. If empty, defaults to "{ComponentName} - BarefootJS"
	Title string

	// Heading is the page heading. If empty, no heading is shown.
	Heading string

	// Extra holds additional data to pass to the layout
	Extra map[string]interface{}
}

// Render renders a component to a full HTML page using the configured layout.
// Child component props are automatically detected (any slice field with ScopeID/Scripts).
func (r *Renderer) Render(opts RenderOptions) string {
	// Create script collector and inject into props
	scriptCollector := NewScriptCollector()
	setScriptsField(opts.Props, scriptCollector)

	// Create portal collector and inject into props
	portalCollector := NewPortalCollector()
	setPortalsField(opts.Props, portalCollector)

	// Auto-detect and process child component props (slices)
	childSlices := findChildComponentSlices(opts.Props)
	for _, slice := range childSlices {
		setScriptsOnSlice(slice, scriptCollector)
		setPortalsOnSlice(slice, portalCollector)
		setBoolOnSlice(slice, "BfIsChild", true)
	}

	// Auto-detect and process single child component props
	singleChildren := findSingleChildComponents(opts.Props)
	for _, child := range singleChildren {
		setScriptsOnSingle(child, scriptCollector)
		setPortalsOnSingle(child, portalCollector)
		setBoolField(child, "BfIsChild", true)
	}

	// Mark the root component so BfPropsAttr emits bf-p only for it
	setBoolField(opts.Props, "BfIsRoot", true)

	// Render the component template
	var componentBuf strings.Builder
	r.templates.ExecuteTemplate(&componentBuf, opts.ComponentName, opts.Props)

	// Determine title (default: "{ComponentName} - BarefootJS")
	title := opts.Title
	if title == "" {
		title = opts.ComponentName + " - BarefootJS"
	}

	// Heading (empty means no heading)
	heading := opts.Heading

	// Build render context
	ctx := &RenderContext{
		ComponentName: opts.ComponentName,
		Props:         opts.Props,
		ComponentHTML: template.HTML(componentBuf.String()),
		Portals:       portalCollector.Render(),
		Scripts:       BfScripts(scriptCollector),
		Title:         title,
		Heading:       heading,
		Extra:         opts.Extra,
	}

	return r.layout(ctx)
}

// setScriptsField sets the Scripts field on a struct using reflection.
func setScriptsField(v interface{}, collector *ScriptCollector) {
	val := reflect.ValueOf(v)
	if val.Kind() == reflect.Ptr {
		val = val.Elem()
	}
	if val.Kind() != reflect.Struct {
		return
	}
	field := val.FieldByName("Scripts")
	if field.IsValid() && field.CanSet() {
		field.Set(reflect.ValueOf(collector))
	}
}

// setPortalsField sets the Portals field on a struct using reflection.
func setPortalsField(v interface{}, collector *PortalCollector) {
	val := reflect.ValueOf(v)
	if val.Kind() == reflect.Ptr {
		val = val.Elem()
	}
	if val.Kind() != reflect.Struct {
		return
	}
	field := val.FieldByName("Portals")
	if field.IsValid() && field.CanSet() {
		field.Set(reflect.ValueOf(collector))
	}
}

// getStringField extracts a string field from a struct using reflection.
func setBoolField(v interface{}, fieldName string, val bool) {
	rv := reflect.ValueOf(v)
	if rv.Kind() == reflect.Ptr {
		rv = rv.Elem()
	}
	if rv.Kind() != reflect.Struct {
		return
	}
	field := rv.FieldByName(fieldName)
	if field.IsValid() && field.CanSet() && field.Kind() == reflect.Bool {
		field.SetBool(val)
	}
}

func getBoolField(v interface{}, fieldName string) bool {
	val := reflect.ValueOf(v)
	if val.Kind() == reflect.Ptr {
		val = val.Elem()
	}
	if val.Kind() != reflect.Struct {
		return false
	}
	field := val.FieldByName(fieldName)
	if !field.IsValid() || field.Kind() != reflect.Bool {
		return false
	}
	return field.Bool()
}

func getStringField(v interface{}, fieldName string) string {
	val := reflect.ValueOf(v)
	if val.Kind() == reflect.Ptr {
		val = val.Elem()
	}
	if val.Kind() != reflect.Struct {
		return ""
	}
	field := val.FieldByName(fieldName)
	if !field.IsValid() || field.Kind() != reflect.String {
		return ""
	}
	return field.String()
}

// findChildComponentSlices finds slice fields containing child component props.
// Child props are identified by having ScopeID and Scripts fields.
func findChildComponentSlices(props interface{}) []interface{} {
	var result []interface{}

	val := reflect.ValueOf(props)
	if val.Kind() == reflect.Ptr {
		val = val.Elem()
	}
	if val.Kind() != reflect.Struct {
		return result
	}

	for i := 0; i < val.NumField(); i++ {
		field := val.Field(i)
		if field.Kind() != reflect.Slice || field.Len() == 0 {
			continue
		}

		elem := field.Index(0)
		if elem.Kind() == reflect.Ptr {
			elem = elem.Elem()
		}
		if elem.Kind() != reflect.Struct {
			continue
		}

		hasScopeID := elem.FieldByName("ScopeID").IsValid()
		hasScripts := elem.FieldByName("Scripts").IsValid()

		if hasScopeID && hasScripts {
			result = append(result, field.Interface())
		}
	}

	return result
}

// setScriptsOnSlice sets Scripts on all items in a slice.
func setScriptsOnSlice(slice interface{}, collector *ScriptCollector) {
	val := reflect.ValueOf(slice)
	if val.Kind() != reflect.Slice {
		return
	}
	for i := 0; i < val.Len(); i++ {
		item := val.Index(i)
		if item.Kind() == reflect.Ptr {
			item = item.Elem()
		}
		if item.Kind() == reflect.Struct {
			field := item.FieldByName("Scripts")
			if field.IsValid() && field.CanSet() {
				field.Set(reflect.ValueOf(collector))
			}
		}
	}
}

// setBoolOnSlice sets a bool field on all items in a slice.
func setBoolOnSlice(slice interface{}, fieldName string, val bool) {
	v := reflect.ValueOf(slice)
	if v.Kind() != reflect.Slice {
		return
	}
	for i := 0; i < v.Len(); i++ {
		item := v.Index(i)
		if item.Kind() == reflect.Ptr {
			item = item.Elem()
		}
		if item.Kind() == reflect.Struct {
			field := item.FieldByName(fieldName)
			if field.IsValid() && field.CanSet() && field.Kind() == reflect.Bool {
				field.SetBool(val)
			}
		}
	}
}

// setPortalsOnSlice sets Portals on all items in a slice.
func setPortalsOnSlice(slice interface{}, collector *PortalCollector) {
	val := reflect.ValueOf(slice)
	if val.Kind() != reflect.Slice {
		return
	}
	for i := 0; i < val.Len(); i++ {
		item := val.Index(i)
		if item.Kind() == reflect.Ptr {
			item = item.Elem()
		}
		if item.Kind() == reflect.Struct {
			field := item.FieldByName("Portals")
			if field.IsValid() && field.CanSet() {
				field.Set(reflect.ValueOf(collector))
			}
		}
	}
}


// findSingleChildComponents finds single struct fields containing child component props.
// Child props are identified by having ScopeID and Scripts fields.
func findSingleChildComponents(props interface{}) []interface{} {
	var result []interface{}

	val := reflect.ValueOf(props)
	if val.Kind() == reflect.Ptr {
		val = val.Elem()
	}
	if val.Kind() != reflect.Struct {
		return result
	}

	for i := 0; i < val.NumField(); i++ {
		field := val.Field(i)

		// Handle pointer to struct
		if field.Kind() == reflect.Ptr {
			if field.IsNil() {
				continue
			}
			field = field.Elem()
		}

		// Skip non-struct fields (slices handled by findChildComponentSlices)
		if field.Kind() != reflect.Struct {
			continue
		}

		hasScopeID := field.FieldByName("ScopeID").IsValid()
		hasScripts := field.FieldByName("Scripts").IsValid()

		if hasScopeID && hasScripts {
			result = append(result, field.Addr().Interface())
		}
	}

	return result
}

// setScriptsOnSingle sets Scripts on a single struct child component.
func setScriptsOnSingle(child interface{}, collector *ScriptCollector) {
	val := reflect.ValueOf(child)
	if val.Kind() == reflect.Ptr {
		val = val.Elem()
	}
	if val.Kind() == reflect.Struct {
		field := val.FieldByName("Scripts")
		if field.IsValid() && field.CanSet() {
			field.Set(reflect.ValueOf(collector))
		}
	}
}

// setPortalsOnSingle sets Portals on a single struct child component.
func setPortalsOnSingle(child interface{}, collector *PortalCollector) {
	val := reflect.ValueOf(child)
	if val.Kind() == reflect.Ptr {
		val = val.Elem()
	}
	if val.Kind() == reflect.Struct {
		field := val.FieldByName("Portals")
		if field.IsValid() && field.CanSet() {
			field.Set(reflect.ValueOf(collector))
		}
	}
}


// =============================================================================
// Internal Helpers
// =============================================================================

func toFloat64(v any) float64 {
	switch n := v.(type) {
	case int:
		return float64(n)
	case int8:
		return float64(n)
	case int16:
		return float64(n)
	case int32:
		return float64(n)
	case int64:
		return float64(n)
	case uint:
		return float64(n)
	case uint8:
		return float64(n)
	case uint16:
		return float64(n)
	case uint32:
		return float64(n)
	case uint64:
		return float64(n)
	case float32:
		return float64(n)
	case float64:
		return n
	default:
		return 0
	}
}

func toInt(v any) int {
	switch n := v.(type) {
	case int:
		return n
	case int8:
		return int(n)
	case int16:
		return int(n)
	case int32:
		return int(n)
	case int64:
		return int(n)
	case uint:
		return int(n)
	case uint8:
		return int(n)
	case uint16:
		return int(n)
	case uint32:
		return int(n)
	case uint64:
		return int(n)
	case float32:
		return int(n)
	case float64:
		return int(n)
	default:
		return 0
	}
}

func isIntLike(v any) bool {
	switch v.(type) {
	case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64:
		return true
	default:
		return false
	}
}

func toString(v any) string {
	switch s := v.(type) {
	case string:
		return s
	case int:
		return strconv.Itoa(s)
	case int64:
		return strconv.FormatInt(s, 10)
	case float64:
		return strconv.FormatFloat(s, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(s)
	default:
		return ""
	}
}
