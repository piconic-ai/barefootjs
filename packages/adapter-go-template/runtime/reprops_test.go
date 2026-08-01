package bf

import (
	"html/template"
	"strings"
	"testing"
)

// Stand-ins for what the compiler generates: an Input, a Props whose Dbl is
// DERIVED at construction time, and the constructor that derives it.
type badgeInput struct {
	ScopeID, BfParent, BfMount string
	Text                       string
	N                          int
}

type badgeProps struct {
	ScopeID   string
	BfParent  string
	BfMount   string
	BfDataKey string
	Scripts   *ScriptCollector
	Children  template.HTML
	Text      string
	N         int
	Dbl       int
}

func newBadgeProps(in badgeInput) badgeProps {
	scopeID := in.ScopeID
	if scopeID == "" {
		// The real generated constructor mints a random id here. A fixed
		// sentinel makes "identity was re-derived instead of carried" visible.
		scopeID = "MINTED"
	}
	return badgeProps{
		ScopeID: scopeID, BfParent: in.BfParent, BfMount: in.BfMount,
		Text: in.Text, N: in.N, Dbl: in.N * 2,
	}
}

// The generated rebuilder, verbatim in shape.
func registerBadge() {
	RegisterReprops("Badge", func(base interface{}, kv ...interface{}) (interface{}, error) {
		b, ok := base.(badgeProps)
		if !ok {
			return nil, RepropsTypeError("Badge", base)
		}
		in := badgeInput{
			ScopeID: b.ScopeID, BfParent: b.BfParent, BfMount: b.BfMount,
			Text: b.Text, N: b.N,
		}
		for i := 0; i < len(kv); i += 2 {
			name, _ := kv[i].(string)
			var err error
			switch name {
			case "Text":
				err = RepropsAssign("Badge", "Text", &in.Text, kv[i+1])
			case "N":
				err = RepropsAssign("Badge", "N", &in.N, kv[i+1])
			default:
				err = RepropsUnknownFieldError("Badge", name)
			}
			if err != nil {
				return nil, err
			}
		}
		p := newBadgeProps(in)
		p.Scripts = b.Scripts
		p.BfDataKey = b.BfDataKey
		return p, nil
	})
}

func baseBadge() badgeProps {
	return newBadgeProps(badgeInput{ScopeID: "parent_s0", BfParent: "parent", BfMount: "s0"})
}

// A rebuild recomputes the DERIVED field, which is the whole point: patching
// fields (bf_with_props) cannot, because the derivation lives in Go code the
// template can't call.
func TestRepropsRecomputesDerivedField(t *testing.T) {
	registerBadge()
	out, err := Reprops("Badge", baseBadge(), "Text", "one", "N", 3)
	if err != nil {
		t.Fatal(err)
	}
	got := out.(badgeProps)
	if got.Text != "one" || got.N != 3 || got.Dbl != 6 {
		t.Errorf("got Text=%q N=%d Dbl=%d, want one/3/6", got.Text, got.N, got.Dbl)
	}
	// Contrast: the same override through WithProps leaves Dbl at the base
	// instance's value. This is the bug the rebuild path exists to close.
	patched, err := WithProps(baseBadge(), "Text", "one", "N", 3)
	if err != nil {
		t.Fatal(err)
	}
	if p := patched.(badgeProps); p.Dbl != 0 {
		t.Errorf("WithProps Dbl = %d, want 0 (the stale value it cannot recompute)", p.Dbl)
	}
}

// Identity must be carried from the base, never re-derived: the constructor
// mints a fresh ScopeID when handed an empty one, and a per-row scope would
// break hydration.
func TestRepropsCarriesIdentity(t *testing.T) {
	registerBadge()
	out, err := Reprops("Badge", baseBadge(), "N", 5)
	if err != nil {
		t.Fatal(err)
	}
	got := out.(badgeProps)
	if got.ScopeID != "parent_s0" || got.BfParent != "parent" || got.BfMount != "s0" {
		t.Errorf("identity not carried: %+v", got)
	}
}

// The base value is untouched — every row rebuilds from the same shared
// instance, so a mutation would leak across rows.
func TestRepropsDoesNotMutateBase(t *testing.T) {
	registerBadge()
	base := baseBadge()
	if _, err := Reprops("Badge", base, "N", 7); err != nil {
		t.Fatal(err)
	}
	if base.N != 0 || base.Dbl != 0 {
		t.Errorf("base mutated: %+v", base)
	}
}

func TestRepropsErrors(t *testing.T) {
	registerBadge()
	if _, err := Reprops("Badge", baseBadge(), "N"); err == nil {
		t.Error("odd kv count should error")
	}
	// An unregistered name must NOT fall back to the stale shared instance —
	// that would reintroduce silently-wrong output.
	if _, err := Reprops("NotRegistered", baseBadge()); err == nil {
		t.Error("unregistered component should error")
	}
	if _, err := Reprops("Badge", "not a props struct"); err == nil {
		t.Error("wrong base type should error")
	}
	// A non-string field name would degrade to "" in the generated
	// `name, _ := kv[i].(string)`, match no case, and silently drop the
	// override. Rejected up front, matching bf_with_props.
	if _, err := Reprops("Badge", baseBadge(), 42, "x"); err == nil {
		t.Error("non-string field name should error")
	}
	if _, err := WithProps(baseBadge(), 42, "x"); err == nil {
		t.Error("bf_with_props rejects it too — the two must agree")
	}
	// An unknown field name means the override would go unapplied. A
	// rebuilder is only emitted for components with no rest bag, so unlike
	// bf_with_props there is no legitimate passthrough here.
	if _, err := Reprops("Badge", baseBadge(), "Nope", 1); err == nil {
		t.Error("unknown field name should error")
	}
}

// Composition order: the compiler emits `bf_with_children (bf_reprops …) …`,
// so children are applied to the REBUILT value and must survive.
func TestWithChildrenComposesOverReprops(t *testing.T) {
	registerBadge()
	rebuilt, err := Reprops("Badge", baseBadge(), "Text", "one", "N", 3)
	if err != nil {
		t.Fatal(err)
	}
	out, err := WithChildren(rebuilt, template.HTML("<em>kid</em>"))
	if err != nil {
		t.Fatal(err)
	}
	got := out.(badgeProps)
	if got.Children != "<em>kid</em>" || got.Dbl != 6 {
		t.Errorf("got Children=%q Dbl=%d", got.Children, got.Dbl)
	}
}

// The registry is read at template EXECUTE time, never at Funcs() time. Go
// initializes a package's variables BEFORE its init() functions, so an app
// that builds its template set in a package-level var calls FuncMap() while
// the registry is still empty. Merging constructors into FuncMap()'s return
// would fail such an app at PARSE time; one fixed entry resolved at execute
// time cannot.
func TestRepropsResolvesAtExecuteTimeNotFuncsTime(t *testing.T) {
	const name = "LateRegistered"
	// Parse against a FuncMap captured while nothing is registered for `name`.
	if RepropsRegistered(name) {
		t.Fatalf("%s registered before the test ran", name)
	}
	tmpl, err := template.New("t").Funcs(FuncMap()).
		Parse(`{{with (bf_reprops "LateRegistered" .Base "N" 4)}}{{.Dbl}}{{end}}`)
	if err != nil {
		t.Fatalf("parse must succeed against an empty registry: %v", err)
	}

	// Registration happens afterwards, as a generated init() would.
	RegisterReprops(name, func(base interface{}, kv ...interface{}) (interface{}, error) {
		b := base.(badgeProps)
		in := badgeInput{ScopeID: b.ScopeID, Text: b.Text, N: b.N}
		for i := 0; i < len(kv); i += 2 {
			if kv[i] == "N" {
				if err := RepropsAssign(name, "N", &in.N, kv[i+1]); err != nil {
					return nil, err
				}
			}
		}
		return newBadgeProps(in), nil
	})

	var sb strings.Builder
	if err := tmpl.Execute(&sb, struct{ Base badgeProps }{baseBadge()}); err != nil {
		t.Fatal(err)
	}
	if sb.String() != "8" {
		t.Errorf("got %q, want %q", sb.String(), "8")
	}
}
