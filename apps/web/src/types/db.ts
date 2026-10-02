
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "accession": {
                  Row: {
                    "accession_number": string,"collection_locality": string | null,"collection_point": unknown,"collector": string | null,"created_at": string,"created_by": string | null,"id": string,"legacy_hortis_id": string | null,"notes": string | null,"organisation_id": string,"provenance_type": string | null,"quantity_received": number | null,"received_date": string | null,"source": string | null,"taxon_id": string,"updated_at": string
                  }
                  Insert: {
                    "accession_number": string,"collection_locality"?: string | null,"collection_point"?: unknown,"collector"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"legacy_hortis_id"?: string | null,"notes"?: string | null,"organisation_id": string,"provenance_type"?: string | null,"quantity_received"?: number | null,"received_date"?: string | null,"source"?: string | null,"taxon_id": string,"updated_at"?: string
                  }
                  Update: {
                    "accession_number"?: string,"collection_locality"?: string | null,"collection_point"?: unknown,"collector"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"legacy_hortis_id"?: string | null,"notes"?: string | null,"organisation_id"?: string,"provenance_type"?: string | null,"quantity_received"?: number | null,"received_date"?: string | null,"source"?: string | null,"taxon_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "accession_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisation"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "accession_taxon_id_fkey"
      columns: ["taxon_id"]
isOneToOne: false
      referencedRelation: "taxon"
      referencedColumns: ["id"]
    }
                  ]
                },"asset": {
                  Row: {
                    "accession_id": string | null,"asset_type_id": string,"attributes": NonNullable<Json>,"barcode": string | null,"condition": number | null,"created_at": string,"created_by": string | null,"criticality": number | null,"geom": unknown,"id": string,"install_date": string | null,"legacy_hortis_id": string | null,"local_x": number | null,"local_y": number | null,"location_id": string | null,"name": string | null,"organisation_id": string,"parent_asset_id": string | null,"plant_count": number | null,"position_accuracy_m": number | null,"position_source": string | null,"site_id": string,"status": Database["public"]['Enums']["asset_status"],"tag_code": string,"taxon_id": string | null,"updated_at": string
                  }
                  Insert: {
                    "accession_id"?: string | null,"asset_type_id": string,"attributes"?: NonNullable<Json>,"barcode"?: string | null,"condition"?: number | null,"created_at"?: string,"created_by"?: string | null,"criticality"?: number | null,"geom": unknown,"id"?: string,"install_date"?: string | null,"legacy_hortis_id"?: string | null,"local_x"?: number | null,"local_y"?: number | null,"location_id"?: string | null,"name"?: string | null,"organisation_id": string,"parent_asset_id"?: string | null,"plant_count"?: number | null,"position_accuracy_m"?: number | null,"position_source"?: string | null,"site_id": string,"status"?: Database["public"]['Enums']["asset_status"],"tag_code": string,"taxon_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "accession_id"?: string | null,"asset_type_id"?: string,"attributes"?: NonNullable<Json>,"barcode"?: string | null,"condition"?: number | null,"created_at"?: string,"created_by"?: string | null,"criticality"?: number | null,"geom"?: unknown,"id"?: string,"install_date"?: string | null,"legacy_hortis_id"?: string | null,"local_x"?: number | null,"local_y"?: number | null,"location_id"?: string | null,"name"?: string | null,"organisation_id"?: string,"parent_asset_id"?: string | null,"plant_count"?: number | null,"position_accuracy_m"?: number | null,"position_source"?: string | null,"site_id"?: string,"status"?: Database["public"]['Enums']["asset_status"],"tag_code"?: string,"taxon_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "asset_accession_id_fkey"
      columns: ["accession_id"]
isOneToOne: false
      referencedRelation: "accession"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "asset_accession_id_organisation_id_fkey"
      columns: ["accession_id","organisation_id"]
isOneToOne: false
      referencedRelation: "accession"
      referencedColumns: ["id","organisation_id"]
    },{
      foreignKeyName: "asset_asset_type_id_fkey"
      columns: ["asset_type_id"]
isOneToOne: false
      referencedRelation: "asset_type"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "asset_asset_type_id_organisation_id_fkey"
      columns: ["asset_type_id","organisation_id"]
isOneToOne: false
      referencedRelation: "asset_type"
      referencedColumns: ["id","organisation_id"]
    },{
      foreignKeyName: "asset_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "location"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "asset_location_id_site_id_fkey"
      columns: ["location_id","site_id"]
isOneToOne: false
      referencedRelation: "location"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "asset_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisation"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "asset_parent_asset_id_fkey"
      columns: ["parent_asset_id"]
isOneToOne: false
      referencedRelation: "asset"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "asset_parent_asset_id_organisation_id_fkey"
      columns: ["parent_asset_id","organisation_id"]
isOneToOne: false
      referencedRelation: "asset"
      referencedColumns: ["id","organisation_id"]
    },{
      foreignKeyName: "asset_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "site"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "asset_site_id_organisation_id_fkey"
      columns: ["site_id","organisation_id"]
isOneToOne: false
      referencedRelation: "site"
      referencedColumns: ["id","organisation_id"]
    },{
      foreignKeyName: "asset_taxon_id_fkey"
      columns: ["taxon_id"]
isOneToOne: false
      referencedRelation: "taxon"
      referencedColumns: ["id"]
    }
                  ]
                },"asset_status_change": {
                  Row: {
                    "asset_id": string,"changed_at": string,"changed_by": string | null,"from_status": Database["public"]['Enums']["asset_status"] | null,"id": string,"organisation_id": string,"reason": string | null,"to_status": Database["public"]['Enums']["asset_status"]
                  }
                  Insert: {
                    "asset_id": string,"changed_at"?: string,"changed_by"?: string | null,"from_status"?: Database["public"]['Enums']["asset_status"] | null,"id"?: string,"organisation_id": string,"reason"?: string | null,"to_status": Database["public"]['Enums']["asset_status"]
                  }
                  Update: {
                    "asset_id"?: string,"changed_at"?: string,"changed_by"?: string | null,"from_status"?: Database["public"]['Enums']["asset_status"] | null,"id"?: string,"organisation_id"?: string,"reason"?: string | null,"to_status"?: Database["public"]['Enums']["asset_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "asset_status_change_asset_id_fkey"
      columns: ["asset_id"]
isOneToOne: false
      referencedRelation: "asset"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "asset_status_change_asset_id_organisation_id_fkey"
      columns: ["asset_id","organisation_id"]
isOneToOne: false
      referencedRelation: "asset"
      referencedColumns: ["id","organisation_id"]
    }
                  ]
                },"asset_type": {
                  Row: {
                    "asset_class": Database["public"]['Enums']["asset_class"],"attribute_schema": NonNullable<Json>,"code": string,"created_at": string,"created_by": string | null,"icon": string | null,"id": string,"name": string,"organisation_id": string,"updated_at": string
                  }
                  Insert: {
                    "asset_class": Database["public"]['Enums']["asset_class"],"attribute_schema"?: NonNullable<Json>,"code": string,"created_at"?: string,"created_by"?: string | null,"icon"?: string | null,"id"?: string,"name": string,"organisation_id": string,"updated_at"?: string
                  }
                  Update: {
                    "asset_class"?: Database["public"]['Enums']["asset_class"],"attribute_schema"?: NonNullable<Json>,"code"?: string,"created_at"?: string,"created_by"?: string | null,"icon"?: string | null,"id"?: string,"name"?: string,"organisation_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "asset_type_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisation"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor": string | null,"at": string,"id": number,"new": Json | null,"old": Json | null,"organisation_id": string,"row_id": string | null,"table_name": string
                  }
                  Insert: {
                    "action": string,"actor"?: string | null,"at"?: string,"id"?: never,"new"?: Json | null,"old"?: Json | null,"organisation_id": string,"row_id"?: string | null,"table_name": string
                  }
                  Update: {
                    "action"?: string,"actor"?: string | null,"at"?: string,"id"?: never,"new"?: Json | null,"old"?: Json | null,"organisation_id"?: string,"row_id"?: string | null,"table_name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisation"
      referencedColumns: ["id"]
    }
                  ]
                },"control_point": {
                  Row: {
                    "accuracy_m": number | null,"code": string,"created_at": string,"created_by": string | null,"description": string | null,"geom": unknown,"id": string,"organisation_id": string,"site_id": string,"source": string,"surveyed_at": string | null,"updated_at": string
                  }
                  Insert: {
                    "accuracy_m"?: number | null,"code": string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"geom": unknown,"id"?: string,"organisation_id": string,"site_id": string,"source": string,"surveyed_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "accuracy_m"?: number | null,"code"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"geom"?: unknown,"id"?: string,"organisation_id"?: string,"site_id"?: string,"source"?: string,"surveyed_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "control_point_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisation"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "control_point_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "site"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "control_point_site_id_organisation_id_fkey"
      columns: ["site_id","organisation_id"]
isOneToOne: false
      referencedRelation: "site"
      referencedColumns: ["id","organisation_id"]
    }
                  ]
                },"line_feature": {
                  Row: {
                    "created_at": string,"created_by": string | null,"geom": unknown,"id": string,"kind": string,"name": string | null,"organisation_id": string,"site_id": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"geom": unknown,"id"?: string,"kind": string,"name"?: string | null,"organisation_id": string,"site_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"geom"?: unknown,"id"?: string,"kind"?: string,"name"?: string | null,"organisation_id"?: string,"site_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "line_feature_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisation"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "line_feature_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "site"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "line_feature_site_id_organisation_id_fkey"
      columns: ["site_id","organisation_id"]
isOneToOne: false
      referencedRelation: "site"
      referencedColumns: ["id","organisation_id"]
    }
                  ]
                },"location": {
                  Row: {
                    "area_m2": number | null,"attributes": NonNullable<Json>,"code": string,"created_at": string,"created_by": string | null,"geom": unknown,"id": string,"kind": Database["public"]['Enums']["location_kind"],"legacy_hortis_id": string | null,"name": string,"organisation_id": string,"parent_id": string | null,"site_id": string,"updated_at": string
                  }
                  Insert: {
                    "area_m2"?: never,"attributes"?: NonNullable<Json>,"code": string,"created_at"?: string,"created_by"?: string | null,"geom": unknown,"id"?: string,"kind": Database["public"]['Enums']["location_kind"],"legacy_hortis_id"?: string | null,"name": string,"organisation_id": string,"parent_id"?: string | null,"site_id": string,"updated_at"?: string
                  }
                  Update: {
                    "area_m2"?: never,"attributes"?: NonNullable<Json>,"code"?: string,"created_at"?: string,"created_by"?: string | null,"geom"?: unknown,"id"?: string,"kind"?: Database["public"]['Enums']["location_kind"],"legacy_hortis_id"?: string | null,"name"?: string,"organisation_id"?: string,"parent_id"?: string | null,"site_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "location_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisation"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "location_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "location"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "location_parent_id_site_id_fkey"
      columns: ["parent_id","site_id"]
isOneToOne: false
      referencedRelation: "location"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "location_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "site"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "location_site_id_organisation_id_fkey"
      columns: ["site_id","organisation_id"]
isOneToOne: false
      referencedRelation: "site"
      referencedColumns: ["id","organisation_id"]
    }
                  ]
                },"media": {
                  Row: {
                    "asset_id": string | null,"bucket": string,"caption": string | null,"created_at": string,"created_by": string | null,"geom": unknown,"id": string,"kind": string,"observation_id": string | null,"organisation_id": string,"path": string,"taken_at": string | null,"updated_at": string,"work_order_id": string | null
                  }
                  Insert: {
                    "asset_id"?: string | null,"bucket": string,"caption"?: string | null,"created_at"?: string,"created_by"?: string | null,"geom"?: unknown,"id"?: string,"kind": string,"observation_id"?: string | null,"organisation_id": string,"path": string,"taken_at"?: string | null,"updated_at"?: string,"work_order_id"?: string | null
                  }
                  Update: {
                    "asset_id"?: string | null,"bucket"?: string,"caption"?: string | null,"created_at"?: string,"created_by"?: string | null,"geom"?: unknown,"id"?: string,"kind"?: string,"observation_id"?: string | null,"organisation_id"?: string,"path"?: string,"taken_at"?: string | null,"updated_at"?: string,"work_order_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "media_asset_id_fkey"
      columns: ["asset_id"]
isOneToOne: false
      referencedRelation: "asset"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "media_asset_id_organisation_id_fkey"
      columns: ["asset_id","organisation_id"]
isOneToOne: false
      referencedRelation: "asset"
      referencedColumns: ["id","organisation_id"]
    },{
      foreignKeyName: "media_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisation"
      referencedColumns: ["id"]
    }
                  ]
                },"membership": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"display_name": string,"organisation_id": string,"roles": (string)[],"team_id": string | null,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"display_name": string,"organisation_id": string,"roles": (string)[],"team_id"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"display_name"?: string,"organisation_id"?: string,"roles"?: (string)[],"team_id"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "membership_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisation"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "membership_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "team"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "membership_team_id_organisation_id_fkey"
      columns: ["team_id","organisation_id"]
isOneToOne: false
      referencedRelation: "team"
      referencedColumns: ["id","organisation_id"]
    }
                  ]
                },"org_taxon": {
                  Row: {
                    "created_at": string,"created_by": string | null,"inhouse_code": string | null,"iucn_category": string | null,"legacy_hortis_id": string | null,"notes": string | null,"organisation_id": string,"origin": string | null,"protection_level": string | null,"sensitive": boolean,"taxon_id": string,"updated_at": string,"zones_present": (string)[] | null
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"inhouse_code"?: string | null,"iucn_category"?: string | null,"legacy_hortis_id"?: string | null,"notes"?: string | null,"organisation_id": string,"origin"?: string | null,"protection_level"?: string | null,"sensitive"?: boolean,"taxon_id": string,"updated_at"?: string,"zones_present"?: (string)[] | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"inhouse_code"?: string | null,"iucn_category"?: string | null,"legacy_hortis_id"?: string | null,"notes"?: string | null,"organisation_id"?: string,"origin"?: string | null,"protection_level"?: string | null,"sensitive"?: boolean,"taxon_id"?: string,"updated_at"?: string,"zones_present"?: (string)[] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_taxon_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisation"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "org_taxon_taxon_id_fkey"
      columns: ["taxon_id"]
isOneToOne: false
      referencedRelation: "taxon"
      referencedColumns: ["id"]
    }
                  ]
                },"organisation": {
                  Row: {
                    "id": string,"name": string,"settings": NonNullable<Json>,"slug": string
                  }
                  Insert: {
                    "id"?: string,"name": string,"settings"?: NonNullable<Json>,"slug": string
                  }
                  Update: {
                    "id"?: string,"name"?: string,"settings"?: NonNullable<Json>,"slug"?: string
                  }
                  Relationships: [
                    
                  ]
                },"site": {
                  Row: {
                    "basemap_url": string | null,"boundary": unknown,"code": string,"created_at": string,"created_by": string | null,"grid_name": string | null,"grid_origin_e": number | null,"grid_origin_n": number | null,"grid_rotation_deg": number,"grid_scale": number,"id": string,"name": string,"organisation_id": string,"site_type": string,"updated_at": string
                  }
                  Insert: {
                    "basemap_url"?: string | null,"boundary": unknown,"code": string,"created_at"?: string,"created_by"?: string | null,"grid_name"?: string | null,"grid_origin_e"?: number | null,"grid_origin_n"?: number | null,"grid_rotation_deg"?: number,"grid_scale"?: number,"id"?: string,"name": string,"organisation_id": string,"site_type": string,"updated_at"?: string
                  }
                  Update: {
                    "basemap_url"?: string | null,"boundary"?: unknown,"code"?: string,"created_at"?: string,"created_by"?: string | null,"grid_name"?: string | null,"grid_origin_e"?: number | null,"grid_origin_n"?: number | null,"grid_rotation_deg"?: number,"grid_scale"?: number,"id"?: string,"name"?: string,"organisation_id"?: string,"site_type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "site_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisation"
      referencedColumns: ["id"]
    }
                  ]
                },"taxon": {
                  Row: {
                    "accepted_taxon_id": string | null,"authorship": string | null,"common_names": NonNullable<Json>,"created_at": string,"created_by": string | null,"cultivar": string | null,"family": string | null,"gbif_key": number | null,"genus": string | null,"id": string,"infraspecific_epithet": string | null,"infraspecific_rank": string | null,"kingdom": string,"rank": string,"scientific_name": string,"specific_epithet": string | null,"updated_at": string
                  }
                  Insert: {
                    "accepted_taxon_id"?: string | null,"authorship"?: string | null,"common_names"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"cultivar"?: string | null,"family"?: string | null,"gbif_key"?: number | null,"genus"?: string | null,"id"?: string,"infraspecific_epithet"?: string | null,"infraspecific_rank"?: string | null,"kingdom": string,"rank": string,"scientific_name": string,"specific_epithet"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "accepted_taxon_id"?: string | null,"authorship"?: string | null,"common_names"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"cultivar"?: string | null,"family"?: string | null,"gbif_key"?: number | null,"genus"?: string | null,"id"?: string,"infraspecific_epithet"?: string | null,"infraspecific_rank"?: string | null,"kingdom"?: string,"rank"?: string,"scientific_name"?: string,"specific_epithet"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "taxon_accepted_taxon_id_fkey"
      columns: ["accepted_taxon_id"]
isOneToOne: false
      referencedRelation: "taxon"
      referencedColumns: ["id"]
    }
                  ]
                },"team": {
                  Row: {
                    "created_at": string,"created_by": string | null,"discipline": string,"id": string,"name": string,"organisation_id": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"discipline": string,"id"?: string,"name": string,"organisation_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"discipline"?: string,"id"?: string,"name"?: string,"organisation_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "team_organisation_id_fkey"
      columns: ["organisation_id"]
isOneToOne: false
      referencedRelation: "organisation"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "asset_detail":
{ Args: { "p_asset": string }; Returns: Json
                           },
"asset_search":
{ Args: { "p_class"?: Database["public"]['Enums']["asset_class"],"p_desc"?: boolean,"p_limit"?: number,"p_location"?: string,"p_offset"?: number,"p_q"?: string,"p_site": string,"p_sort"?: string,"p_status"?: (Database["public"]['Enums']["asset_status"])[],"p_type"?: string }; Returns: Json
                           },
"asset_set_status":
{ Args: { "p_asset": string,"p_reason"?: string,"p_status": Database["public"]['Enums']["asset_status"] }; Returns: undefined
                           },
"asset_timeline":
{ Args: { "p_asset": string }; Returns: Json
                           },
"auth_org_ids":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"has_any_role":
{ Args: { "org": string,"rs": (string)[] }; Returns: boolean
                           },
"has_role":
{ Args: { "org": string,"r": string }; Returns: boolean
                           },
"has_role_anywhere":
{ Args: { "r": string }; Returns: boolean
                           },
"map_asset_detail":
{ Args: { "p_site": string,"p_tag": string }; Returns: Json
                           },
"map_assets":
{ Args: { "p_east": number,"p_limit"?: number,"p_north": number,"p_site": string,"p_south": number,"p_west": number }; Returns: Json
                           },
"map_locations":
{ Args: { "p_site": string }; Returns: Json
                           },
"map_site":
{ Args: { "p_site": string }; Returns: Json
                           },
"resolve_location":
{ Args: { "p_geom": unknown,"p_site"?: string }; Returns: string
                           },
"site_from_local":
{ Args: { "p_site": string,"p_x": number,"p_y": number }; Returns: unknown
                           },
"site_local_xy":
{ Args: { "p_lat": number,"p_lon": number,"p_site": string }; Returns: {
              "x": number,"y": number
            }[]
                           },
"site_to_local":
{ Args: { "p_geom": unknown,"p_site": string }; Returns: unknown
                           }
          }
          Enums: {
            "asset_class": "living"|"built","asset_status": "planned"|"planted"|"established"|"active"|"declining"|"dead"|"removed"|"out_of_service"|"disposed","location_kind": "zone"|"bed"|"habitat"|"water_body"|"building"|"sub_area"|"other"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "asset_class": ["living", "built"],"asset_status": ["planned", "planted", "established", "active", "declining", "dead", "removed", "out_of_service", "disposed"],"location_kind": ["zone", "bed", "habitat", "water_body", "building", "sub_area", "other"]
          }
        }
} as const

