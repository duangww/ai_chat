*----------------------------------------------------------------------*
* 拷贝替换 ZCL_MCP_DEMO 的 MCP_LOGIN
* 通用接口账号调用；JSON.uname 为业务账号，查 AGR_1251 / AGR_USERS
* Body：{ "uname": "BAKKF" }  不传则用 sy-uname
*----------------------------------------------------------------------*
  METHOD mcp_login.

    TYPES: BEGIN OF ty_tool,
             tool      TYPE ztmcp_tool-tool,
             tool_text TYPE ztmcp_tool-tool_text,
           END OF ty_tool.

    DATA: BEGIN OF ls_req,
            uname TYPE sy-uname,
          END OF ls_req.

    DATA: BEGIN OF ls_out,
            user_id   TYPE usr01-bname,
            user_name TYPE adrp-name_text,
            type      TYPE bapiret2-type,
            message   TYPE bapiret2-message,
            tools     TYPE TABLE OF ty_tool,
          END OF ls_out.

    /ui2/cl_json=>deserialize(
      EXPORTING
        json        = io_request->get_cdata( )
        pretty_name = /ui2/cl_json=>pretty_mode-low_case
      CHANGING
        data        = ls_req
    ).

    ls_out-user_id = ls_req-uname.
    IF ls_out-user_id IS INITIAL.
      ls_out-user_id = sy-uname.
    ENDIF.

    SELECT SINGLE concat( name_last, name_first )
      FROM adrp AS a
      INNER JOIN usr21 AS b
        ON a~persnumber = b~persnumber
      WHERE b~bname     = @ls_out-user_id
        AND date_from  LE @sy-datum
        AND date_to    GE @sy-datum
      INTO @ls_out-user_name.

    SELECT DISTINCT a~low AS tool
      FROM agr_1251 AS a
      INNER JOIN agr_users AS b
        ON  a~agr_name = b~agr_name
       AND b~uname     = @ls_out-user_id
       AND b~from_dat  LE @sy-datum
       AND b~to_dat    GE @sy-datum
      WHERE a~object  = 'ZMCP'
        AND a~field   = 'ZTOOL'
        AND a~deleted = @space
      INTO CORRESPONDING FIELDS OF TABLE @ls_out-tools.

    IF ls_out-tools IS INITIAL.
      ls_out-type    = 'E'.
      ls_out-message = |用户 { ls_out-user_id } 缺少 MCP 的 ZTOOL 权限,请联系管理员|.
    ELSE.
      ls_out-type    = 'S'.
      ls_out-message = 'MCP登录认证成功'.
    ENDIF.

    LOOP AT ls_out-tools ASSIGNING FIELD-SYMBOL(<fs_tool>).
      SELECT SINGLE tool_text
        INTO <fs_tool>-tool_text
        FROM ztmcp_tool
       WHERE tool = <fs_tool>-tool.
    ENDLOOP.

    ev_json = /ui2/cl_json=>serialize(
      data        = ls_out
      pretty_name = /ui2/cl_json=>pretty_mode-low_case
    ).

    gs_msg-msg_content = ls_out-message.
    gs_msg-msg_type    = ls_out-type.
    gs_msg-ref_doc     = ls_out-user_id.

  ENDMETHOD.
