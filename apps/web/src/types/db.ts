export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      accession: {
        Row: {
          accession_number: string;
          attributes: NonNullable<Json>;
          collection_locality: string | null;
          collection_point: unknown;
          collector: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          legacy_hortis_id: string | null;
          notes: string | null;
          organisation_id: string;
          provenance_type: string | null;
          quantity_received: number | null;
          received_date: string | null;
          source: string | null;
          taxon_id: string;
          updated_at: string;
        };
        Insert: {
          accession_number: string;
          attributes?: NonNullable<Json>;
          collection_locality?: string | null;
          collection_point?: unknown;
          collector?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          legacy_hortis_id?: string | null;
          notes?: string | null;
          organisation_id: string;
          provenance_type?: string | null;
          quantity_received?: number | null;
          received_date?: string | null;
          source?: string | null;
          taxon_id: string;
          updated_at?: string;
        };
        Update: {
          accession_number?: string;
          attributes?: NonNullable<Json>;
          collection_locality?: string | null;
          collection_point?: unknown;
          collector?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          legacy_hortis_id?: string | null;
          notes?: string | null;
          organisation_id?: string;
          provenance_type?: string | null;
          quantity_received?: number | null;
          received_date?: string | null;
          source?: string | null;
          taxon_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'accession_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisation';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'accession_taxon_id_fkey';
            columns: ['taxon_id'];
            isOneToOne: false;
            referencedRelation: 'taxon';
            referencedColumns: ['id'];
          },
        ];
      };
      asset: {
        Row: {
          accession_id: string | null;
          asset_type_id: string;
          attributes: NonNullable<Json>;
          barcode: string | null;
          condition: number | null;
          created_at: string;
          created_by: string | null;
          criticality: number | null;
          geom: unknown;
          id: string;
          install_date: string | null;
          legacy_hortis_id: string | null;
          local_x: number | null;
          local_y: number | null;
          location_id: string | null;
          name: string | null;
          organisation_id: string;
          parent_asset_id: string | null;
          plant_count: number | null;
          position_accuracy_m: number | null;
          position_source: string | null;
          site_id: string;
          status: Database['public']['Enums']['asset_status'];
          tag_code: string;
          taxon_id: string | null;
          updated_at: string;
        };
        Insert: {
          accession_id?: string | null;
          asset_type_id: string;
          attributes?: NonNullable<Json>;
          barcode?: string | null;
          condition?: number | null;
          created_at?: string;
          created_by?: string | null;
          criticality?: number | null;
          geom: unknown;
          id?: string;
          install_date?: string | null;
          legacy_hortis_id?: string | null;
          local_x?: number | null;
          local_y?: number | null;
          location_id?: string | null;
          name?: string | null;
          organisation_id: string;
          parent_asset_id?: string | null;
          plant_count?: number | null;
          position_accuracy_m?: number | null;
          position_source?: string | null;
          site_id: string;
          status?: Database['public']['Enums']['asset_status'];
          tag_code: string;
          taxon_id?: string | null;
          updated_at?: string;
        };
        Update: {
          accession_id?: string | null;
          asset_type_id?: string;
          attributes?: NonNullable<Json>;
          barcode?: string | null;
          condition?: number | null;
          created_at?: string;
          created_by?: string | null;
          criticality?: number | null;
          geom?: unknown;
          id?: string;
          install_date?: string | null;
          legacy_hortis_id?: string | null;
          local_x?: number | null;
          local_y?: number | null;
          location_id?: string | null;
          name?: string | null;
          organisation_id?: string;
          parent_asset_id?: string | null;
          plant_count?: number | null;
          position_accuracy_m?: number | null;
          position_source?: string | null;
          site_id?: string;
          status?: Database['public']['Enums']['asset_status'];
          tag_code?: string;
          taxon_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'asset_accession_id_fkey';
            columns: ['accession_id'];
            isOneToOne: false;
            referencedRelation: 'accession';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'asset_accession_id_organisation_id_fkey';
            columns: ['accession_id', 'organisation_id'];
            isOneToOne: false;
            referencedRelation: 'accession';
            referencedColumns: ['id', 'organisation_id'];
          },
          {
            foreignKeyName: 'asset_asset_type_id_fkey';
            columns: ['asset_type_id'];
            isOneToOne: false;
            referencedRelation: 'asset_type';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'asset_asset_type_id_organisation_id_fkey';
            columns: ['asset_type_id', 'organisation_id'];
            isOneToOne: false;
            referencedRelation: 'asset_type';
            referencedColumns: ['id', 'organisation_id'];
          },
          {
            foreignKeyName: 'asset_location_id_fkey';
            columns: ['location_id'];
            isOneToOne: false;
            referencedRelation: 'location';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'asset_location_id_site_id_fkey';
            columns: ['location_id', 'site_id'];
            isOneToOne: false;
            referencedRelation: 'location';
            referencedColumns: ['id', 'site_id'];
          },
          {
            foreignKeyName: 'asset_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisation';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'asset_parent_asset_id_fkey';
            columns: ['parent_asset_id'];
            isOneToOne: false;
            referencedRelation: 'asset';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'asset_parent_asset_id_organisation_id_fkey';
            columns: ['parent_asset_id', 'organisation_id'];
            isOneToOne: false;
            referencedRelation: 'asset';
            referencedColumns: ['id', 'organisation_id'];
          },
          {
            foreignKeyName: 'asset_site_id_fkey';
            columns: ['site_id'];
            isOneToOne: false;
            referencedRelation: 'site';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'asset_site_id_organisation_id_fkey';
            columns: ['site_id', 'organisation_id'];
            isOneToOne: false;
            referencedRelation: 'site';
            referencedColumns: ['id', 'organisation_id'];
          },
          {
            foreignKeyName: 'asset_taxon_id_fkey';
            columns: ['taxon_id'];
            isOneToOne: false;
            referencedRelation: 'taxon';
            referencedColumns: ['id'];
          },
        ];
      };
      asset_status_change: {
        Row: {
          asset_id: string;
          changed_at: string;
          changed_by: string | null;
          from_status: Database['public']['Enums']['asset_status'] | null;
          id: string;
          organisation_id: string;
          reason: string | null;
          to_status: Database['public']['Enums']['asset_status'];
        };
        Insert: {
          asset_id: string;
          changed_at?: string;
          changed_by?: string | null;
          from_status?: Database['public']['Enums']['asset_status'] | null;
          id?: string;
          organisation_id: string;
          reason?: string | null;
          to_status: Database['public']['Enums']['asset_status'];
        };
        Update: {
          asset_id?: string;
          changed_at?: string;
          changed_by?: string | null;
          from_status?: Database['public']['Enums']['asset_status'] | null;
          id?: string;
          organisation_id?: string;
          reason?: string | null;
          to_status?: Database['public']['Enums']['asset_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'asset_status_change_asset_id_fkey';
            columns: ['asset_id'];
            isOneToOne: false;
            referencedRelation: 'asset';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'asset_status_change_asset_id_organisation_id_fkey';
            columns: ['asset_id', 'organisation_id'];
            isOneToOne: false;
            referencedRelation: 'asset';
            referencedColumns: ['id', 'organisation_id'];
          },
        ];
      };
      asset_type: {
        Row: {
          asset_class: Database['public']['Enums']['asset_class'];
          attribute_schema: NonNullable<Json>;
          code: string;
          created_at: string;
          created_by: string | null;
          icon: string | null;
          id: string;
          name: string;
          name_ar: string | null;
          organisation_id: string;
          updated_at: string;
          asset_type_tag_prefix: string | null;
        };
        Insert: {
          asset_class: Database['public']['Enums']['asset_class'];
          attribute_schema?: NonNullable<Json>;
          code: string;
          created_at?: string;
          created_by?: string | null;
          icon?: string | null;
          id?: string;
          name: string;
          name_ar?: string | null;
          organisation_id: string;
          updated_at?: string;
        };
        Update: {
          asset_class?: Database['public']['Enums']['asset_class'];
          attribute_schema?: NonNullable<Json>;
          code?: string;
          created_at?: string;
          created_by?: string | null;
          icon?: string | null;
          id?: string;
          name?: string;
          name_ar?: string | null;
          organisation_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'asset_type_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisation';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_log: {
        Row: {
          action: string;
          actor: string | null;
          at: string;
          id: number;
          new: Json | null;
          old: Json | null;
          organisation_id: string;
          row_id: string | null;
          table_name: string;
        };
        Insert: {
          action: string;
          actor?: string | null;
          at?: string;
          id?: never;
          new?: Json | null;
          old?: Json | null;
          organisation_id: string;
          row_id?: string | null;
          table_name: string;
        };
        Update: {
          action?: string;
          actor?: string | null;
          at?: string;
          id?: never;
          new?: Json | null;
          old?: Json | null;
          organisation_id?: string;
          row_id?: string | null;
          table_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_log_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisation';
            referencedColumns: ['id'];
          },
        ];
      };
      control_point: {
        Row: {
          accuracy_m: number | null;
          code: string;
          created_at: string;
          created_by: string | null;
          description: string | null;
          geom: unknown;
          id: string;
          organisation_id: string;
          ref_source: string | null;
          ref_x: number | null;
          ref_y: number | null;
          site_id: string;
          source: string;
          surveyed_at: string | null;
          updated_at: string;
        };
        Insert: {
          accuracy_m?: number | null;
          code: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          geom: unknown;
          id?: string;
          organisation_id: string;
          ref_source?: string | null;
          ref_x?: number | null;
          ref_y?: number | null;
          site_id: string;
          source: string;
          surveyed_at?: string | null;
          updated_at?: string;
        };
        Update: {
          accuracy_m?: number | null;
          code?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          geom?: unknown;
          id?: string;
          organisation_id?: string;
          ref_source?: string | null;
          ref_x?: number | null;
          ref_y?: number | null;
          site_id?: string;
          source?: string;
          surveyed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'control_point_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisation';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'control_point_site_id_fkey';
            columns: ['site_id'];
            isOneToOne: false;
            referencedRelation: 'site';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'control_point_site_id_organisation_id_fkey';
            columns: ['site_id', 'organisation_id'];
            isOneToOne: false;
            referencedRelation: 'site';
            referencedColumns: ['id', 'organisation_id'];
          },
        ];
      };
      line_feature: {
        Row: {
          created_at: string;
          created_by: string | null;
          geom: unknown;
          id: string;
          kind: string;
          name: string | null;
          organisation_id: string;
          site_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          geom: unknown;
          id?: string;
          kind: string;
          name?: string | null;
          organisation_id: string;
          site_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          geom?: unknown;
          id?: string;
          kind?: string;
          name?: string | null;
          organisation_id?: string;
          site_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'line_feature_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisation';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'line_feature_site_id_fkey';
            columns: ['site_id'];
            isOneToOne: false;
            referencedRelation: 'site';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'line_feature_site_id_organisation_id_fkey';
            columns: ['site_id', 'organisation_id'];
            isOneToOne: false;
            referencedRelation: 'site';
            referencedColumns: ['id', 'organisation_id'];
          },
        ];
      };
      location: {
        Row: {
          area_m2: number | null;
          attributes: NonNullable<Json>;
          code: string;
          created_at: string;
          created_by: string | null;
          geom: unknown;
          id: string;
          kind: Database['public']['Enums']['location_kind'];
          legacy_hortis_id: string | null;
          name: string;
          organisation_id: string;
          parent_id: string | null;
          site_id: string;
          updated_at: string;
        };
        Insert: {
          area_m2?: never;
          attributes?: NonNullable<Json>;
          code: string;
          created_at?: string;
          created_by?: string | null;
          geom: unknown;
          id?: string;
          kind: Database['public']['Enums']['location_kind'];
          legacy_hortis_id?: string | null;
          name: string;
          organisation_id: string;
          parent_id?: string | null;
          site_id: string;
          updated_at?: string;
        };
        Update: {
          area_m2?: never;
          attributes?: NonNullable<Json>;
          code?: string;
          created_at?: string;
          created_by?: string | null;
          geom?: unknown;
          id?: string;
          kind?: Database['public']['Enums']['location_kind'];
          legacy_hortis_id?: string | null;
          name?: string;
          organisation_id?: string;
          parent_id?: string | null;
          site_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'location_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisation';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'location_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: false;
            referencedRelation: 'location';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'location_parent_id_site_id_fkey';
            columns: ['parent_id', 'site_id'];
            isOneToOne: false;
            referencedRelation: 'location';
            referencedColumns: ['id', 'site_id'];
          },
          {
            foreignKeyName: 'location_site_id_fkey';
            columns: ['site_id'];
            isOneToOne: false;
            referencedRelation: 'site';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'location_site_id_organisation_id_fkey';
            columns: ['site_id', 'organisation_id'];
            isOneToOne: false;
            referencedRelation: 'site';
            referencedColumns: ['id', 'organisation_id'];
          },
        ];
      };
      media: {
        Row: {
          asset_id: string | null;
          bucket: string;
          caption: string | null;
          created_at: string;
          created_by: string | null;
          geom: unknown;
          id: string;
          kind: string;
          observation_id: string | null;
          organisation_id: string;
          path: string;
          taken_at: string | null;
          updated_at: string;
          work_order_id: string | null;
        };
        Insert: {
          asset_id?: string | null;
          bucket: string;
          caption?: string | null;
          created_at?: string;
          created_by?: string | null;
          geom?: unknown;
          id?: string;
          kind: string;
          observation_id?: string | null;
          organisation_id: string;
          path: string;
          taken_at?: string | null;
          updated_at?: string;
          work_order_id?: string | null;
        };
        Update: {
          asset_id?: string | null;
          bucket?: string;
          caption?: string | null;
          created_at?: string;
          created_by?: string | null;
          geom?: unknown;
          id?: string;
          kind?: string;
          observation_id?: string | null;
          organisation_id?: string;
          path?: string;
          taken_at?: string | null;
          updated_at?: string;
          work_order_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'media_asset_id_fkey';
            columns: ['asset_id'];
            isOneToOne: false;
            referencedRelation: 'asset';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'media_asset_id_organisation_id_fkey';
            columns: ['asset_id', 'organisation_id'];
            isOneToOne: false;
            referencedRelation: 'asset';
            referencedColumns: ['id', 'organisation_id'];
          },
          {
            foreignKeyName: 'media_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisation';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'media_work_order_id_fkey';
            columns: ['work_order_id'];
            isOneToOne: false;
            referencedRelation: 'work_order';
            referencedColumns: ['id'];
          },
        ];
      };
      membership: {
        Row: {
          active: boolean;
          created_at: string;
          created_by: string | null;
          display_name: string;
          organisation_id: string;
          roles: string[];
          team_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          display_name: string;
          organisation_id: string;
          roles: string[];
          team_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          display_name?: string;
          organisation_id?: string;
          roles?: string[];
          team_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'membership_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisation';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'membership_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'team';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'membership_team_id_organisation_id_fkey';
            columns: ['team_id', 'organisation_id'];
            isOneToOne: false;
            referencedRelation: 'team';
            referencedColumns: ['id', 'organisation_id'];
          },
        ];
      };
      org_taxon: {
        Row: {
          attributes: NonNullable<Json>;
          created_at: string;
          created_by: string | null;
          inhouse_code: string | null;
          iucn_category: string | null;
          legacy_hortis_id: string | null;
          notes: string | null;
          organisation_id: string;
          origin: string | null;
          protection_level: string | null;
          sensitive: boolean;
          taxon_id: string;
          updated_at: string;
          zones_present: string[] | null;
        };
        Insert: {
          attributes?: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          inhouse_code?: string | null;
          iucn_category?: string | null;
          legacy_hortis_id?: string | null;
          notes?: string | null;
          organisation_id: string;
          origin?: string | null;
          protection_level?: string | null;
          sensitive?: boolean;
          taxon_id: string;
          updated_at?: string;
          zones_present?: string[] | null;
        };
        Update: {
          attributes?: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          inhouse_code?: string | null;
          iucn_category?: string | null;
          legacy_hortis_id?: string | null;
          notes?: string | null;
          organisation_id?: string;
          origin?: string | null;
          protection_level?: string | null;
          sensitive?: boolean;
          taxon_id?: string;
          updated_at?: string;
          zones_present?: string[] | null;
        };
        Relationships: [
          {
            foreignKeyName: 'org_taxon_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisation';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'org_taxon_taxon_id_fkey';
            columns: ['taxon_id'];
            isOneToOne: false;
            referencedRelation: 'taxon';
            referencedColumns: ['id'];
          },
        ];
      };
      organisation: {
        Row: {
          id: string;
          name: string;
          settings: NonNullable<Json>;
          slug: string;
        };
        Insert: {
          id?: string;
          name: string;
          settings?: NonNullable<Json>;
          slug: string;
        };
        Update: {
          id?: string;
          name?: string;
          settings?: NonNullable<Json>;
          slug?: string;
        };
        Relationships: [];
      };
      pm_schedule: {
        Row: {
          active: boolean;
          created_at: string;
          created_by: string | null;
          horizon_days: number;
          id: string;
          last_generated_until: string | null;
          max_per_day: number | null;
          organisation_id: string;
          rule: NonNullable<Json>;
          target_asset_id: string | null;
          target_asset_type_id: string | null;
          target_kind: string;
          target_location_id: string | null;
          template_id: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          horizon_days?: number;
          id?: string;
          last_generated_until?: string | null;
          max_per_day?: number | null;
          organisation_id: string;
          rule: NonNullable<Json>;
          target_asset_id?: string | null;
          target_asset_type_id?: string | null;
          target_kind: string;
          target_location_id?: string | null;
          template_id: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          horizon_days?: number;
          id?: string;
          last_generated_until?: string | null;
          max_per_day?: number | null;
          organisation_id?: string;
          rule?: NonNullable<Json>;
          target_asset_id?: string | null;
          target_asset_type_id?: string | null;
          target_kind?: string;
          target_location_id?: string | null;
          template_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'pm_schedule_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisation';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pm_schedule_target_asset_id_fkey';
            columns: ['target_asset_id'];
            isOneToOne: false;
            referencedRelation: 'asset';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pm_schedule_target_asset_id_organisation_id_fkey';
            columns: ['target_asset_id', 'organisation_id'];
            isOneToOne: false;
            referencedRelation: 'asset';
            referencedColumns: ['id', 'organisation_id'];
          },
          {
            foreignKeyName: 'pm_schedule_target_asset_type_id_fkey';
            columns: ['target_asset_type_id'];
            isOneToOne: false;
            referencedRelation: 'asset_type';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pm_schedule_target_asset_type_id_organisation_id_fkey';
            columns: ['target_asset_type_id', 'organisation_id'];
            isOneToOne: false;
            referencedRelation: 'asset_type';
            referencedColumns: ['id', 'organisation_id'];
          },
          {
            foreignKeyName: 'pm_schedule_target_location_id_fkey';
            columns: ['target_location_id'];
            isOneToOne: false;
            referencedRelation: 'location';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pm_schedule_target_location_id_organisation_id_fkey';
            columns: ['target_location_id', 'organisation_id'];
            isOneToOne: false;
            referencedRelation: 'location';
            referencedColumns: ['id', 'organisation_id'];
          },
          {
            foreignKeyName: 'pm_schedule_template_id_fkey';
            columns: ['template_id'];
            isOneToOne: false;
            referencedRelation: 'wo_template';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pm_schedule_template_id_organisation_id_fkey';
            columns: ['template_id', 'organisation_id'];
            isOneToOne: false;
            referencedRelation: 'wo_template';
            referencedColumns: ['id', 'organisation_id'];
          },
        ];
      };
      site: {
        Row: {
          basemap_url: string | null;
          boundary: unknown;
          code: string;
          created_at: string;
          created_by: string | null;
          grid_name: string | null;
          grid_origin_e: number | null;
          grid_origin_n: number | null;
          grid_rotation_deg: number;
          grid_scale: number;
          id: string;
          name: string;
          organisation_id: string;
          site_type: string;
          updated_at: string;
        };
        Insert: {
          basemap_url?: string | null;
          boundary: unknown;
          code: string;
          created_at?: string;
          created_by?: string | null;
          grid_name?: string | null;
          grid_origin_e?: number | null;
          grid_origin_n?: number | null;
          grid_rotation_deg?: number;
          grid_scale?: number;
          id?: string;
          name: string;
          organisation_id: string;
          site_type: string;
          updated_at?: string;
        };
        Update: {
          basemap_url?: string | null;
          boundary?: unknown;
          code?: string;
          created_at?: string;
          created_by?: string | null;
          grid_name?: string | null;
          grid_origin_e?: number | null;
          grid_origin_n?: number | null;
          grid_rotation_deg?: number;
          grid_scale?: number;
          id?: string;
          name?: string;
          organisation_id?: string;
          site_type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'site_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisation';
            referencedColumns: ['id'];
          },
        ];
      };
      sop: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          code: string;
          created_at: string;
          created_by: string | null;
          hazards: string[] | null;
          id: string;
          organisation_id: string;
          ppe: string[] | null;
          purpose: Json | null;
          status: string;
          title: NonNullable<Json>;
          updated_at: string;
          version: number;
        };
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          code: string;
          created_at?: string;
          created_by?: string | null;
          hazards?: string[] | null;
          id?: string;
          organisation_id: string;
          ppe?: string[] | null;
          purpose?: Json | null;
          status?: string;
          title: NonNullable<Json>;
          updated_at?: string;
          version?: number;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          code?: string;
          created_at?: string;
          created_by?: string | null;
          hazards?: string[] | null;
          id?: string;
          organisation_id?: string;
          ppe?: string[] | null;
          purpose?: Json | null;
          status?: string;
          title?: NonNullable<Json>;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'sop_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisation';
            referencedColumns: ['id'];
          },
        ];
      };
      sop_response: {
        Row: {
          answered_at: string;
          answered_by: string | null;
          media_id: string | null;
          organisation_id: string;
          sop_step_id: string;
          value: Json | null;
          work_order_id: string;
        };
        Insert: {
          answered_at?: string;
          answered_by?: string | null;
          media_id?: string | null;
          organisation_id: string;
          sop_step_id: string;
          value?: Json | null;
          work_order_id: string;
        };
        Update: {
          answered_at?: string;
          answered_by?: string | null;
          media_id?: string | null;
          organisation_id?: string;
          sop_step_id?: string;
          value?: Json | null;
          work_order_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sop_response_media_id_fkey';
            columns: ['media_id'];
            isOneToOne: false;
            referencedRelation: 'media';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sop_response_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisation';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sop_response_sop_step_id_fkey';
            columns: ['sop_step_id'];
            isOneToOne: false;
            referencedRelation: 'sop_step';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sop_response_sop_step_id_organisation_id_fkey';
            columns: ['sop_step_id', 'organisation_id'];
            isOneToOne: false;
            referencedRelation: 'sop_step';
            referencedColumns: ['id', 'organisation_id'];
          },
          {
            foreignKeyName: 'sop_response_work_order_id_fkey';
            columns: ['work_order_id'];
            isOneToOne: false;
            referencedRelation: 'work_order';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sop_response_work_order_id_organisation_id_fkey';
            columns: ['work_order_id', 'organisation_id'];
            isOneToOne: false;
            referencedRelation: 'work_order';
            referencedColumns: ['id', 'organisation_id'];
          },
        ];
      };
      sop_step: {
        Row: {
          choices: string[] | null;
          created_at: string;
          created_by: string | null;
          id: string;
          input_type: string;
          media_path: string | null;
          organisation_id: string;
          required: boolean;
          seq: number;
          sop_id: string;
          text: NonNullable<Json>;
          unit: string | null;
          updated_at: string;
        };
        Insert: {
          choices?: string[] | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          input_type: string;
          media_path?: string | null;
          organisation_id: string;
          required?: boolean;
          seq: number;
          sop_id: string;
          text: NonNullable<Json>;
          unit?: string | null;
          updated_at?: string;
        };
        Update: {
          choices?: string[] | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          input_type?: string;
          media_path?: string | null;
          organisation_id?: string;
          required?: boolean;
          seq?: number;
          sop_id?: string;
          text?: NonNullable<Json>;
          unit?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sop_step_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisation';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sop_step_sop_id_fkey';
            columns: ['sop_id'];
            isOneToOne: false;
            referencedRelation: 'sop';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sop_step_sop_id_organisation_id_fkey';
            columns: ['sop_id', 'organisation_id'];
            isOneToOne: false;
            referencedRelation: 'sop';
            referencedColumns: ['id', 'organisation_id'];
          },
        ];
      };
      taxon: {
        Row: {
          accepted_taxon_id: string | null;
          authorship: string | null;
          common_names: NonNullable<Json>;
          created_at: string;
          created_by: string | null;
          cultivar: string | null;
          family: string | null;
          gbif_key: number | null;
          genus: string | null;
          id: string;
          infraspecific_epithet: string | null;
          infraspecific_rank: string | null;
          kingdom: string;
          rank: string;
          scientific_name: string;
          specific_epithet: string | null;
          updated_at: string;
        };
        Insert: {
          accepted_taxon_id?: string | null;
          authorship?: string | null;
          common_names?: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          cultivar?: string | null;
          family?: string | null;
          gbif_key?: number | null;
          genus?: string | null;
          id?: string;
          infraspecific_epithet?: string | null;
          infraspecific_rank?: string | null;
          kingdom: string;
          rank: string;
          scientific_name: string;
          specific_epithet?: string | null;
          updated_at?: string;
        };
        Update: {
          accepted_taxon_id?: string | null;
          authorship?: string | null;
          common_names?: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          cultivar?: string | null;
          family?: string | null;
          gbif_key?: number | null;
          genus?: string | null;
          id?: string;
          infraspecific_epithet?: string | null;
          infraspecific_rank?: string | null;
          kingdom?: string;
          rank?: string;
          scientific_name?: string;
          specific_epithet?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'taxon_accepted_taxon_id_fkey';
            columns: ['accepted_taxon_id'];
            isOneToOne: false;
            referencedRelation: 'taxon';
            referencedColumns: ['id'];
          },
        ];
      };
      team: {
        Row: {
          created_at: string;
          created_by: string | null;
          discipline: string;
          id: string;
          name: string;
          organisation_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          discipline: string;
          id?: string;
          name: string;
          organisation_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          discipline?: string;
          id?: string;
          name?: string;
          organisation_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'team_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisation';
            referencedColumns: ['id'];
          },
        ];
      };
      wo_number_seq: {
        Row: {
          last_value: number;
          organisation_id: string;
          year: number;
        };
        Insert: {
          last_value?: number;
          organisation_id: string;
          year: number;
        };
        Update: {
          last_value?: number;
          organisation_id?: string;
          year?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'wo_number_seq_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisation';
            referencedColumns: ['id'];
          },
        ];
      };
      wo_template: {
        Row: {
          code: string;
          created_at: string;
          created_by: string | null;
          default_priority: string;
          est_minutes: number | null;
          id: string;
          organisation_id: string;
          sop_id: string | null;
          team_id: string | null;
          title: string;
          updated_at: string;
          wo_type: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          created_by?: string | null;
          default_priority?: string;
          est_minutes?: number | null;
          id?: string;
          organisation_id: string;
          sop_id?: string | null;
          team_id?: string | null;
          title: string;
          updated_at?: string;
          wo_type: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string | null;
          default_priority?: string;
          est_minutes?: number | null;
          id?: string;
          organisation_id?: string;
          sop_id?: string | null;
          team_id?: string | null;
          title?: string;
          updated_at?: string;
          wo_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'wo_template_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisation';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wo_template_sop_id_fkey';
            columns: ['sop_id'];
            isOneToOne: false;
            referencedRelation: 'sop';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wo_template_sop_id_organisation_id_fkey';
            columns: ['sop_id', 'organisation_id'];
            isOneToOne: false;
            referencedRelation: 'sop';
            referencedColumns: ['id', 'organisation_id'];
          },
          {
            foreignKeyName: 'wo_template_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'team';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wo_template_team_id_organisation_id_fkey';
            columns: ['team_id', 'organisation_id'];
            isOneToOne: false;
            referencedRelation: 'team';
            referencedColumns: ['id', 'organisation_id'];
          },
        ];
      };
      wo_transition_rule: {
        Row: {
          assignee_allowed: boolean;
          from_status: Database['public']['Enums']['wo_status'];
          note_required: boolean;
          roles: string[];
          to_status: Database['public']['Enums']['wo_status'];
        };
        Insert: {
          assignee_allowed: boolean;
          from_status: Database['public']['Enums']['wo_status'];
          note_required?: boolean;
          roles: string[];
          to_status: Database['public']['Enums']['wo_status'];
        };
        Update: {
          assignee_allowed?: boolean;
          from_status?: Database['public']['Enums']['wo_status'];
          note_required?: boolean;
          roles?: string[];
          to_status?: Database['public']['Enums']['wo_status'];
        };
        Relationships: [];
      };
      work_order: {
        Row: {
          actual_minutes: number | null;
          assignee_user_id: string | null;
          client_uuid: string | null;
          completion_notes: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          due_at: string | null;
          est_minutes: number | null;
          geom: unknown;
          id: string;
          location_id: string | null;
          materials: NonNullable<Json>;
          number: string;
          organisation_id: string;
          planned_end: string | null;
          planned_start: string | null;
          pm_schedule_id: string | null;
          priority: string;
          site_id: string;
          sop_id: string | null;
          source: string;
          source_ref: string | null;
          status: Database['public']['Enums']['wo_status'];
          team_id: string | null;
          template_id: string | null;
          title: string;
          updated_at: string;
          wo_type: string;
        };
        Insert: {
          actual_minutes?: number | null;
          assignee_user_id?: string | null;
          client_uuid?: string | null;
          completion_notes?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          due_at?: string | null;
          est_minutes?: number | null;
          geom?: unknown;
          id?: string;
          location_id?: string | null;
          materials?: NonNullable<Json>;
          number: string;
          organisation_id: string;
          planned_end?: string | null;
          planned_start?: string | null;
          pm_schedule_id?: string | null;
          priority?: string;
          site_id: string;
          sop_id?: string | null;
          source: string;
          source_ref?: string | null;
          status: Database['public']['Enums']['wo_status'];
          team_id?: string | null;
          template_id?: string | null;
          title: string;
          updated_at?: string;
          wo_type: string;
        };
        Update: {
          actual_minutes?: number | null;
          assignee_user_id?: string | null;
          client_uuid?: string | null;
          completion_notes?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          due_at?: string | null;
          est_minutes?: number | null;
          geom?: unknown;
          id?: string;
          location_id?: string | null;
          materials?: NonNullable<Json>;
          number?: string;
          organisation_id?: string;
          planned_end?: string | null;
          planned_start?: string | null;
          pm_schedule_id?: string | null;
          priority?: string;
          site_id?: string;
          sop_id?: string | null;
          source?: string;
          source_ref?: string | null;
          status?: Database['public']['Enums']['wo_status'];
          team_id?: string | null;
          template_id?: string | null;
          title?: string;
          updated_at?: string;
          wo_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'work_order_location_id_fkey';
            columns: ['location_id'];
            isOneToOne: false;
            referencedRelation: 'location';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'work_order_location_id_organisation_id_fkey';
            columns: ['location_id', 'organisation_id'];
            isOneToOne: false;
            referencedRelation: 'location';
            referencedColumns: ['id', 'organisation_id'];
          },
          {
            foreignKeyName: 'work_order_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisation';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'work_order_pm_schedule_id_fkey';
            columns: ['pm_schedule_id'];
            isOneToOne: false;
            referencedRelation: 'pm_schedule';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'work_order_pm_schedule_id_organisation_id_fkey';
            columns: ['pm_schedule_id', 'organisation_id'];
            isOneToOne: false;
            referencedRelation: 'pm_schedule';
            referencedColumns: ['id', 'organisation_id'];
          },
          {
            foreignKeyName: 'work_order_site_id_fkey';
            columns: ['site_id'];
            isOneToOne: false;
            referencedRelation: 'site';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'work_order_site_id_organisation_id_fkey';
            columns: ['site_id', 'organisation_id'];
            isOneToOne: false;
            referencedRelation: 'site';
            referencedColumns: ['id', 'organisation_id'];
          },
          {
            foreignKeyName: 'work_order_sop_id_fkey';
            columns: ['sop_id'];
            isOneToOne: false;
            referencedRelation: 'sop';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'work_order_sop_id_organisation_id_fkey';
            columns: ['sop_id', 'organisation_id'];
            isOneToOne: false;
            referencedRelation: 'sop';
            referencedColumns: ['id', 'organisation_id'];
          },
          {
            foreignKeyName: 'work_order_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'team';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'work_order_team_id_organisation_id_fkey';
            columns: ['team_id', 'organisation_id'];
            isOneToOne: false;
            referencedRelation: 'team';
            referencedColumns: ['id', 'organisation_id'];
          },
          {
            foreignKeyName: 'work_order_template_id_fkey';
            columns: ['template_id'];
            isOneToOne: false;
            referencedRelation: 'wo_template';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'work_order_template_id_organisation_id_fkey';
            columns: ['template_id', 'organisation_id'];
            isOneToOne: false;
            referencedRelation: 'wo_template';
            referencedColumns: ['id', 'organisation_id'];
          },
        ];
      };
      work_order_asset: {
        Row: {
          asset_id: string;
          created_at: string;
          created_by: string | null;
          organisation_id: string;
          work_order_id: string;
        };
        Insert: {
          asset_id: string;
          created_at?: string;
          created_by?: string | null;
          organisation_id: string;
          work_order_id: string;
        };
        Update: {
          asset_id?: string;
          created_at?: string;
          created_by?: string | null;
          organisation_id?: string;
          work_order_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'work_order_asset_asset_id_fkey';
            columns: ['asset_id'];
            isOneToOne: false;
            referencedRelation: 'asset';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'work_order_asset_asset_id_organisation_id_fkey';
            columns: ['asset_id', 'organisation_id'];
            isOneToOne: false;
            referencedRelation: 'asset';
            referencedColumns: ['id', 'organisation_id'];
          },
          {
            foreignKeyName: 'work_order_asset_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisation';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'work_order_asset_work_order_id_fkey';
            columns: ['work_order_id'];
            isOneToOne: false;
            referencedRelation: 'work_order';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'work_order_asset_work_order_id_organisation_id_fkey';
            columns: ['work_order_id', 'organisation_id'];
            isOneToOne: false;
            referencedRelation: 'work_order';
            referencedColumns: ['id', 'organisation_id'];
          },
        ];
      };
      work_order_event: {
        Row: {
          actor: string | null;
          at: string;
          client_uuid: string | null;
          from_status: Database['public']['Enums']['wo_status'] | null;
          geom: unknown;
          id: string;
          note: string | null;
          organisation_id: string;
          source: string;
          to_status: Database['public']['Enums']['wo_status'];
          work_order_id: string;
        };
        Insert: {
          actor?: string | null;
          at?: string;
          client_uuid?: string | null;
          from_status?: Database['public']['Enums']['wo_status'] | null;
          geom?: unknown;
          id?: string;
          note?: string | null;
          organisation_id: string;
          source?: string;
          to_status: Database['public']['Enums']['wo_status'];
          work_order_id: string;
        };
        Update: {
          actor?: string | null;
          at?: string;
          client_uuid?: string | null;
          from_status?: Database['public']['Enums']['wo_status'] | null;
          geom?: unknown;
          id?: string;
          note?: string | null;
          organisation_id?: string;
          source?: string;
          to_status?: Database['public']['Enums']['wo_status'];
          work_order_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'work_order_event_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisation';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'work_order_event_work_order_id_fkey';
            columns: ['work_order_id'];
            isOneToOne: false;
            referencedRelation: 'work_order';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'work_order_event_work_order_id_organisation_id_fkey';
            columns: ['work_order_id', 'organisation_id'];
            isOneToOne: false;
            referencedRelation: 'work_order';
            referencedColumns: ['id', 'organisation_id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      asset_by_code: {
        Args: { p_code: string; p_org?: string };
        Returns: {
          id: string;
          matched: string;
          organisation_id: string;
          tag_code: string;
        }[];
      };
      asset_detail: { Args: { p_asset: string }; Returns: Json };
      asset_labels: { Args: { p_assets: string[] }; Returns: Json };
      asset_move_offset: {
        Args: { p_accuracy?: number; p_asset: string; p_dx: number; p_dy: number };
        Returns: Json;
      };
      asset_search: {
        Args: {
          p_class?: Database['public']['Enums']['asset_class'];
          p_desc?: boolean;
          p_limit?: number;
          p_location?: string;
          p_offset?: number;
          p_q?: string;
          p_site: string;
          p_sort?: string;
          p_status?: Database['public']['Enums']['asset_status'][];
          p_type?: string;
        };
        Returns: Json;
      };
      asset_set_status: {
        Args: {
          p_asset: string;
          p_reason?: string;
          p_status: Database['public']['Enums']['asset_status'];
        };
        Returns: undefined;
      };
      asset_timeline: { Args: { p_asset: string }; Returns: Json };
      asset_type_tag_prefix: {
        Args: { p_type: Database['public']['Tables']['asset_type']['Row'] };
        Returns: string;
      };
      auth_org_ids: { Args: Record<PropertyKey, never>; Returns: string[] };
      check_tag: {
        Args: {
          p_asset?: string;
          p_class: Database['public']['Enums']['asset_class'];
          p_org: string;
          p_tag: string;
        };
        Returns: Json;
      };
      control_point_list: { Args: { p_site: string }; Returns: Json };
      field_job: { Args: { p_wo: string }; Returns: Json };
      field_my_day: { Args: { p_day: string; p_site: string }; Returns: Json };
      field_offline_pack: { Args: { p_from: string; p_site: string; p_to: string }; Returns: Json };
      field_scan: { Args: { p_asset: string }; Returns: Json };
      has_any_role: { Args: { org: string; rs: string[] }; Returns: boolean };
      has_role: { Args: { org: string; r: string }; Returns: boolean };
      has_role_anywhere: { Args: { r: string }; Returns: boolean };
      in_season: { Args: { d: string; p_rule: Json }; Returns: boolean };
      map_asset_detail: { Args: { p_site: string; p_tag: string }; Returns: Json };
      map_assets: {
        Args: {
          p_east: number;
          p_limit?: number;
          p_north: number;
          p_site: string;
          p_south: number;
          p_west: number;
        };
        Returns: Json;
      };
      map_locations: { Args: { p_site: string }; Returns: Json };
      map_site: { Args: { p_site: string }; Returns: Json };
      nearest_bed_corner: {
        Args: { p_lat: number; p_lon: number; p_max_m?: number; p_site: string };
        Returns: Json;
      };
      next_wo_number: { Args: { p_org: string }; Returns: string };
      org_sla_hours: { Args: { p_org: string; p_priority: string }; Returns: number };
      org_today: { Args: { p_org: string }; Returns: string };
      org_working_days: { Args: { p_org: string }; Returns: number[] };
      pm_generate: { Args: { p_org: string; p_until?: string }; Returns: Json };
      pm_generate_all: { Args: Record<PropertyKey, never>; Returns: Json };
      pm_periods: {
        Args: { p_anchor: string; p_from: string; p_rule: Json; p_to: string; p_working: number[] };
        Returns: {
          days: string[];
          period_start: string;
        }[];
      };
      pm_targets: {
        Args: { p_schedule: string };
        Returns: {
          asset_id: string;
          label: string;
          location_id: string;
        }[];
      };
      resolve_location: { Args: { p_geom: unknown; p_site?: string }; Returns: string };
      site_from_local: { Args: { p_site: string; p_x: number; p_y: number }; Returns: unknown };
      site_geom_from_local: { Args: { p_geom: unknown; p_site: string }; Returns: unknown };
      site_local_xy: {
        Args: { p_lat: number; p_lon: number; p_site: string };
        Returns: {
          x: number;
          y: number;
        }[];
      };
      site_offset_geom: {
        Args: { p_dx: number; p_dy: number; p_geom: unknown; p_site: string };
        Returns: unknown;
      };
      site_point: {
        Args: { p_a: number; p_b: number; p_site: string; p_system: string };
        Returns: Json;
      };
      site_to_local: { Args: { p_geom: unknown; p_site: string }; Returns: unknown };
      sop_approve: { Args: { p_sop: string }; Returns: undefined };
      sop_library: { Args: { p_org: string }; Returns: Json };
      sop_new_version: { Args: { p_sop: string }; Returns: string };
      sop_reorder: { Args: { p_sop: string; p_steps: string[] }; Returns: undefined };
      suggest_tag: {
        Args: {
          p_geom: unknown;
          p_group?: boolean;
          p_site: string;
          p_taxon?: string;
          p_type: string;
        };
        Returns: string;
      };
      tag_pattern_ok: {
        Args: { p_class: Database['public']['Enums']['asset_class']; p_tag: string };
        Returns: boolean;
      };
      taxon_detail: { Args: { p_org: string; p_taxon: string }; Returns: Json };
      taxon_history: { Args: { p_org: string; p_taxon: string }; Returns: Json };
      taxon_list: {
        Args: {
          p_code?: string;
          p_desc?: boolean;
          p_iucn?: string;
          p_limit?: number;
          p_offset?: number;
          p_org: string;
          p_origin?: string;
          p_q?: string;
          p_sort?: string;
          p_zone?: string;
        };
        Returns: Json;
      };
      taxon_search: { Args: { p_limit?: number; p_org: string; p_q: string }; Returns: Json };
      taxon_tag_code: { Args: { p_org: string; p_taxon: string }; Returns: string };
      weekday0: { Args: { d: string }; Returns: number };
      wo_allowed_transitions: {
        Args: { p_wo: string };
        Returns: {
          note_required: boolean;
          to_status: Database['public']['Enums']['wo_status'];
        }[];
      };
      wo_autoclose: { Args: { p_after?: string }; Returns: number };
      wo_board: {
        Args: {
          p_from?: string;
          p_limit?: number;
          p_open_only?: boolean;
          p_site: string;
          p_status?: Database['public']['Enums']['wo_status'][];
          p_to?: string;
        };
        Returns: Json;
      };
      wo_bulk_move: { Args: { p_from: string; p_site: string; p_to: string }; Returns: number };
      wo_detail: { Args: { p_wo: string }; Returns: Json };
      wo_is_mine: { Args: { p_assignee: string; p_org: string; p_team: string }; Returns: boolean };
      wo_missing_steps: {
        Args: { p_wo: string };
        Returns: {
          input_type: string;
          seq: number;
          step_id: string;
          text: Json;
        }[];
      };
      wo_people: { Args: { p_org: string }; Returns: Json };
      wo_replan: {
        Args: {
          p_assignee?: string;
          p_keep_assignment?: boolean;
          p_start: string;
          p_team?: string;
          p_wo: string;
        };
        Returns: undefined;
      };
      wo_schedule: {
        Args: {
          p_assignee: string;
          p_minutes?: number;
          p_note?: string;
          p_start: string;
          p_team: string;
          p_wo: string;
        };
        Returns: Json;
      };
      wo_transition: {
        Args: {
          p_client_uuid?: string;
          p_geom?: unknown;
          p_note?: string;
          p_to: Database['public']['Enums']['wo_status'];
          p_wo: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      asset_class: 'living' | 'built';
      asset_status:
        | 'planned'
        | 'planted'
        | 'established'
        | 'active'
        | 'declining'
        | 'dead'
        | 'removed'
        | 'out_of_service'
        | 'disposed';
      location_kind: 'zone' | 'bed' | 'habitat' | 'water_body' | 'building' | 'sub_area' | 'other';
      wo_status:
        | 'requested'
        | 'approved'
        | 'scheduled'
        | 'in_progress'
        | 'on_hold'
        | 'completed'
        | 'verified'
        | 'closed'
        | 'cancelled';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      asset_class: ['living', 'built'],
      asset_status: [
        'planned',
        'planted',
        'established',
        'active',
        'declining',
        'dead',
        'removed',
        'out_of_service',
        'disposed',
      ],
      location_kind: ['zone', 'bed', 'habitat', 'water_body', 'building', 'sub_area', 'other'],
      wo_status: [
        'requested',
        'approved',
        'scheduled',
        'in_progress',
        'on_hold',
        'completed',
        'verified',
        'closed',
        'cancelled',
      ],
    },
  },
} as const;
