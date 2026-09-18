*----------------------------------------------------------------------*
* 加到 ZCL_MCP_DEMO PRIVATE SECTION：
*   METHODS check_mcp_tool
*     IMPORTING
*       iv_uname     TYPE sy-uname
*       iv_tool      TYPE string
*     RETURNING
*       VALUE(rv_ok) TYPE abap_bool.
*----------------------------------------------------------------------*
  METHOD check_mcp_tool.

    DATA lv_uname TYPE sy-uname.
    DATA lv_tool  TYPE agr_1251-low.

    lv_uname = iv_uname.
    IF lv_uname IS INITIAL.
      lv_uname = sy-uname.
    ENDIF.
    lv_tool = to_upper( iv_tool ).

    SELECT SINGLE a~low
      FROM agr_1251 AS a
      INNER JOIN agr_users AS b
        ON  a~agr_name = b~agr_name
       AND b~uname     = @lv_uname
       AND b~from_dat  LE @sy-datum
       AND b~to_dat    GE @sy-datum
      WHERE a~object  = 'ZMCP'
        AND a~field   = 'ZTOOL'
        AND a~deleted = @space
        AND ( a~low = @lv_tool OR a~low = '*' )
      INTO @DATA(lv_low).

    rv_ok = xsdbool( sy-subrc = 0 ).

  ENDMETHOD.
