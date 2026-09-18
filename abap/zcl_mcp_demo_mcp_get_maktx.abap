*----------------------------------------------------------------------*
* 拷贝到 ZCL_MCP_DEMO 的 MCP_GET_MAKTX
* 通用接口账号调用；uname 为业务账号，权限查 AGR_1251
* Body：
*   { "uname": "BAKKF", "matnr": "10000001" }
*----------------------------------------------------------------------*
  METHOD mcp_get_maktx.

    DATA: BEGIN OF ls_req,
            uname TYPE sy-uname,
            matnr TYPE makt-matnr,
          END OF ls_req.

    DATA: BEGIN OF ls_out,
            type    TYPE bapiret2-type,
            message TYPE bapiret2-message,
            matnr   TYPE matnr,
            maktx   TYPE makt-maktx,
          END OF ls_out.

    DATA(lv_json_in) = io_request->get_cdata( ).

    /ui2/cl_json=>deserialize(
      EXPORTING
        json        = lv_json_in
        pretty_name = /ui2/cl_json=>pretty_mode-low_case
      CHANGING
        data        = ls_req
    ).

    IF check_mcp_tool( iv_uname = ls_req-uname iv_tool = 'GET_MAKTX' ) = abap_false.
      ls_out-type    = 'E'.
      ls_out-message = |用户 { ls_req-uname } 无权限 GET_MAKTX|.
      gs_msg-msg_type    = ls_out-type.
      gs_msg-msg_content = ls_out-message.
      ev_json = /ui2/cl_json=>serialize(
        data        = ls_out
        pretty_name = /ui2/cl_json=>pretty_mode-low_case
      ).
      RETURN.
    ENDIF.

    DATA(lv_matnr) = conv matnr( |{ ls_req-matnr ALPHA = IN }| ).

    IF lv_matnr IS INITIAL.
      ls_out-type    = 'E'.
      ls_out-message = '物料号 matnr 不能为空'.
    ELSE.
      SELECT SINGLE matnr, maktx
        FROM makt
        WHERE spras = @sy-langu
          AND matnr = @lv_matnr
        INTO (@ls_out-matnr, @ls_out-maktx).
      IF sy-subrc = 0.
        ls_out-type    = 'S'.
        ls_out-message = '查询物料描述成功'.
      ELSE.
        ls_out-type    = 'E'.
        ls_out-message = |未找到物料 { ls_req-matnr } 的描述|.
        ls_out-matnr   = ls_req-matnr.
      ENDIF.
    ENDIF.

    gs_msg-msg_type    = ls_out-type.
    gs_msg-msg_content = ls_out-message.
    gs_msg-ref_doc     = lv_matnr.

    ev_json = /ui2/cl_json=>serialize(
      data        = ls_out
      pretty_name = /ui2/cl_json=>pretty_mode-low_case
    ).

  ENDMETHOD.
