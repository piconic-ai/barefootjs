package main

import (
	bf "github.com/barefootjs/runtime/bf"
)

// RowData represents a rowdata.
type RowData struct {
	ID int `json:"id"`
	Label string `json:"label"`
}

// BenchSsrInput is the user-facing input type.
type BenchSsrInput struct {
	ScopeID string // Optional: if empty, random ID is generated
	BfParent string // Optional: parent scope id
	BfMount string // Optional: slot id in parent
	InitialRows []RowData
}

// BenchSsrProps is the props type for the BenchSsr component.
type BenchSsrProps struct {
	ScopeID string `json:"scopeID"`
	BfIsRoot bool `json:"-"`
	BfIsChild bool `json:"-"`
	BfParent string `json:"-"`
	BfMount string `json:"-"`
	BfDataKey string `json:"-"`
	Scripts *bf.ScriptCollector `json:"-"`
	InitialRows []RowData `json:"initialRows"`
	Selected int `json:"selected"`
}

// NewBenchSsrProps creates BenchSsrProps from BenchSsrInput.
func NewBenchSsrProps(in BenchSsrInput) BenchSsrProps {
	scopeID := in.ScopeID
	if scopeID == "" {
		scopeID = "BenchSsr_" + randomID(6)
	}

	return BenchSsrProps{
		ScopeID: scopeID,
		BfParent: in.BfParent,
		BfMount: in.BfMount,
		InitialRows: in.InitialRows,
		Selected: 0,
	}
}