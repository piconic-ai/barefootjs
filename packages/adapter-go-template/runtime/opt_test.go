package bf

import (
	"bytes"
	"encoding/json"
	"testing"
	"html/template"
)

// The four states of an Opt (spec/js-undefined-value.md §3) and their JS
// values.
func TestOptStates(t *testing.T) {
	cases := []struct {
		name      string
		o         Opt[string]
		passed    bool
		undefined bool
		v         any
	}{
		{"absent", Opt[string]{}, false, true, Undefined},
		{"present undefined", Undef[string](), true, true, Undefined},
		{"null", Null[string](), true, false, nil},
		{"value", Some("x"), true, false, "x"},
		{"empty value", Some(""), true, false, ""},
	}
	for _, c := range cases {
		if got := c.o.Passed(); got != c.passed {
			t.Errorf("%s: Passed() = %v, want %v", c.name, got, c.passed)
		}
		if got := c.o.IsUndefined(); got != c.undefined {
			t.Errorf("%s: IsUndefined() = %v, want %v", c.name, got, c.undefined)
		}
		if got := c.o.V(); got != c.v {
			t.Errorf("%s: V() = %#v, want %#v", c.name, got, c.v)
		}
	}
	if !(Opt[string]{}).Forward().Passed() || !IsUndefined((Opt[string]{}).Forward().V()) {
		t.Error("Forward of an absent Opt must be a present undefined")
	}
	if got := Some("x").Forward().V(); got != "x" {
		t.Errorf("Forward of a value = %#v, want x", got)
	}
}

// encoding/json tells a missing key from `null`, and `omitzero` drops an
// undefined member as JSON.stringify does.
func TestOptJSON(t *testing.T) {
	type input struct {
		C Opt[string]  `json:"c,omitzero"`
		N Opt[float64] `json:"n,omitzero"`
	}
	var in input
	if err := json.Unmarshal([]byte(`{"c":null,"n":2}`), &in); err != nil {
		t.Fatal(err)
	}
	if !in.C.Passed() || in.C.V() != nil {
		t.Errorf("c: null decodes to Null, got %#v", in.C)
	}
	if in.N.V() != 2.0 {
		t.Errorf("n: 2 decodes to Some(2), got %#v", in.N)
	}
	var empty input
	if err := json.Unmarshal([]byte(`{}`), &empty); err != nil {
		t.Fatal(err)
	}
	if empty.C.Passed() || empty.N.Passed() {
		t.Error("a missing key decodes to absent")
	}
	for _, c := range []struct {
		in   input
		want string
	}{
		{input{}, `{}`},
		{input{C: Undef[string]()}, `{}`},
		{input{C: Null[string](), N: Some(0.0)}, `{"c":null,"n":0}`},
	} {
		b, err := json.Marshal(c.in)
		if err != nil {
			t.Fatal(err)
		}
		if string(b) != c.want {
			t.Errorf("Marshal(%#v) = %s, want %s", c.in, b, c.want)
		}
	}
}

// OptOf and Coerce turn a JS value into a field's own type: an Opt keeps
// the four states, a plain field the value converted.
func TestOptOfAndCoerce(t *testing.T) {
	if o := OptOf[float64](3); !o.IsSet() || o.Value() != 3 {
		t.Errorf("OptOf[float64](3) = %#v", o)
	}
	if o := OptOf[string](nil); !o.Passed() || o.V() != nil {
		t.Errorf("OptOf(nil) = %#v, want Null", o)
	}
	if o := OptOf[string](Undefined); !o.Passed() || !IsUndefined(o.V()) {
		t.Errorf("OptOf(Undefined) = %#v, want Undef", o)
	}
	// An Opt source keeps its state, absent included.
	if o := Coerce(Opt[string]{}, Opt[string]{}); o.Passed() {
		t.Errorf("Coerce of an absent Opt = %#v, want absent", o)
	}
	if o := Coerce(Opt[string]{}, Null[string]()); !o.Passed() || o.V() != nil {
		t.Errorf("Coerce of a Null Opt = %#v, want Null", o)
	}
	if got := Coerce("", Some("x")); got != "x" {
		t.Errorf("Coerce into string of Some(x) = %q", got)
	}
	if got := Coerce(0.0, 2); got != 2.0 {
		t.Errorf("Coerce into float64 of int 2 = %v", got)
	}
	if got := Coerce("", Undefined); got != "" {
		t.Errorf("Coerce into string of Undefined = %q, want the zero value", got)
	}
	defer func() {
		if recover() == nil {
			t.Error("Coerce of a number into a string must panic, not spell a code point")
		}
	}()
	Coerce("", 65)
}

// A template reads an Opt row field through bf_js, and html/template's own
// `ne x nil` reads Undefined as nil.
func TestOptInTemplate(t *testing.T) {
	type row struct{ S Opt[string] }
	tmpl := template.Must(template.New("t").Funcs(FuncMap()).Parse(
		`[{{bf_js .S}}|{{if ne (bf_js .S) nil}}set{{else}}nil{{end}}|{{bf_to_string (bf_js .S)}}]`))
	for _, c := range []struct {
		r    row
		want string
	}{
		{row{}, "[|nil|undefined]"},
		{row{S: Null[string]()}, "[|nil|null]"},
		{row{S: Some("")}, "[|set|]"},
		{row{S: Some("o")}, "[o|set|o]"},
	} {
		var buf bytes.Buffer
		if err := tmpl.Execute(&buf, c.r); err != nil {
			t.Fatal(err)
		}
		if buf.String() != c.want {
			t.Errorf("%#v renders %q, want %q", c.r, buf.String(), c.want)
		}
	}
}

// JSON follows JSON.stringify: an undefined member is dropped, an undefined
// element is null, and a top-level undefined gives no string.
func TestJSONUndefined(t *testing.T) {
	got, err := JSON(map[string]any{"a": nil, "b": Undefined, "c": []any{Undefined, 1}})
	if err != nil {
		t.Fatal(err)
	}
	if got != `{"a":null,"c":[null,1]}` {
		t.Errorf("JSON = %v", got)
	}
	if top, _ := JSON(Undefined); !IsUndefined(top) {
		t.Errorf("JSON(Undefined) = %#v, want Undefined", top)
	}
	type rowT struct {
		K string      `json:"k"`
		S Opt[string] `json:"s,omitzero"`
	}
	got, err = JSON([]rowT{{K: "a"}, {K: "b", S: Null[string]()}})
	if err != nil {
		t.Fatal(err)
	}
	if got != `[{"k":"a"},{"k":"b","s":null}]` {
		t.Errorf("JSON of rows = %v", got)
	}
}
